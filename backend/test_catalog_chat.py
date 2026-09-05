"""Catalog-only chatbot contract tests; no external services required."""
import json
import re
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from backend import main


class CatalogChatTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.key = patch.object(main, 'LLM_API_KEY', '')
        self.key.start()

    def tearDown(self):
        self.key.stop()
        self.client.close()

    def chat(self, message, history=None):
        response = self.client.post('/api/chat', json={'message': message, 'history': history or []})
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/event-stream', response.headers['content-type'])
        self.assertTrue(response.text.endswith('data: [DONE]\n\n'))
        return ''.join(json.loads(line[6:])['delta'] for line in response.text.splitlines()
                       if line.startswith('data: ') and line != 'data: [DONE]')

    def test_menu_and_snapshot_contract(self):
        menu = self.client.get('/api/menu').json()
        self.assertEqual((len(menu['stalls']), len(menu['dishes'])), (15, 35))
        snapshot = self.client.get('/api/stall-log').json()['snapshot']
        self.assertEqual(snapshot['source'], 'catalog')
        for stored, projected in zip(menu['stalls'], snapshot['stalls']):
            self.assertEqual(projected['status'], stored['status'])
            self.assertEqual(projected['queueMinutes'], stored['baseQueueMinutes'])
            self.assertEqual(projected['prepMinutes'], stored['basePrepMinutes'])
            self.assertEqual(projected['estimatedTotalWait'], stored['baseQueueMinutes'] + stored['basePrepMinutes'])
        blob = json.dumps([menu, snapshot, self.client.get('/api/config').json()])
        for key in ['simulationTimestamp', 'runSeed', 'visitorOrders', 'serviceCapacity', 'estimatedPickupTime']:
            self.assertNotIn(key, blob)

    def test_named_stall_menu_includes_all_its_dishes_only(self):
        text = self.chat('What is on the menu at City Satay?')
        self.assertIn('Ketupat Rice Cake', text)
        self.assertIn('Chicken Satay', text)
        self.assertNotIn('Laksa', text)
        self.assertNotIn('<!--RECOMMEND:', text)

    def test_dish_price_preserves_portion_prices(self):
        text = self.chat('How much is the sambal stingray?')
        self.assertIn('SGD $16.00 / $22.00', text)
        self.assertIn('Boon Tat', text)
        self.assertNotIn('Chicken Satay', text)

    def test_numbered_stall_and_followup_timing(self):
        history = [{'role': 'user', 'content': 'Tell me about stall 7'}]
        for question, previous in [('How long is the wait at stall #7?', []), ('How long is the wait there?', history)]:
            text = self.chat(question, previous)
            self.assertIn('Katong Laksa Kitchen', text)
            self.assertIn('Stored catalog estimates, not live queue readings', text)
            self.assertIn('total estimated wait', text)
            self.assertNotIn('City Satay', text)

    def test_explicit_new_reference_overrides_history(self):
        text = self.chat('How long is the queue at stall 5?', [{'role': 'user', 'content': 'Tell me about stall 7'}])
        self.assertIn('Marina Refreshments', text)
        self.assertNotIn('Katong Laksa', text)

    def test_unknown_stall(self):
        text = self.chat('Recommend food at stall 999')
        self.assertIn('not in the restaurant catalog', text)
        self.assertNotIn('<!--RECOMMEND:', text)

    def test_queries_never_change_catalog_estimates(self):
        first = main._extract_menu_snapshot()['stalls']
        for question in ['How long is the queue?', 'Recommend laksa', 'Order me satay']:
            self.chat(question)
        self.assertEqual(first, main._extract_menu_snapshot(force_refresh=True)['stalls'])
        self.assertFalse(hasattr(main, 'simulation'))

    def test_order_endpoint_absent_and_order_requests_bypass_llm(self):
        self.assertNotIn('/api/orders', self.client.get('/openapi.json').json()['paths'])
        self.assertGreaterEqual(self.client.post('/api/orders', json={'dishId': '7-1'}).status_code, 400)
        with patch.object(main, 'LLM_API_KEY', 'test'), patch.object(main.openai_client.chat.completions, 'create', new_callable=AsyncMock) as call:
            for question in ['Place an order for laksa', 'Can you order satay for me?', 'I want to order chicken rice',
                             'Checkout', 'Where is my order?', 'My queue number is #42']:
                text = self.chat(question)
                self.assertIn('information and recommendations only', text, question)
                self.assertNotIn('<!--RECOMMEND:', text)
                self.assertNotIn('Order confirmed', text)
            call.assert_not_called()

    def test_recommendation_marker_retains_frontend_fields(self):
        text = self.chat('Recommend food at stall 7')
        marker = json.loads(re.search(r'<!--RECOMMEND: (.*?) -->', text).group(1))
        self.assertEqual(marker['stallId'], 7)
        self.assertEqual(marker['estimatedTotalWait'], marker['prepMinutes'] + marker['queueMinutes'])
        for key in ['dishId', 'dishName', 'stallName', 'price', 'prepTime', 'imageUrl']:
            self.assertIn(key, marker)
        self.assertNotIn('estimatedPickupTime', marker)
        self.assertIn('stored catalog wait estimate', text)

    def test_llm_prompt_receives_same_selected_facts_and_fallback_on_outage(self):
        async def stream():
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='Catalog answer.'))])
        with patch.object(main, 'LLM_API_KEY', 'test'), patch.object(main.openai_client.chat.completions, 'create', new_callable=AsyncMock) as call:
            call.return_value = stream()
            text = self.chat('Recommend food at stall 7')
            self.assertIn('Catalog answer.', text)
            self.assertEqual(text.count('<!--RECOMMEND:'), 1)
            prompt = call.call_args.kwargs['messages'][0]['content']
            relevant = prompt.split('RELEVANT RESTAURANT AND DISH FACTS:\n')[1].split('\nAnswer questions')[0]
            self.assertEqual([s['id'] for s in json.loads(relevant)['stalls']], [7])
            self.assertIn('stored catalog estimates', prompt)
            self.assertNotIn('VISITOR ORDERS', prompt)
            call.side_effect = RuntimeError('test outage')
            text = self.chat('How much is sambal stingray?')
            self.assertIn('SGD $16.00 / $22.00', text)
            self.assertNotIn('<!--RECOMMEND:', text)

    def test_stored_closed_status_is_respected(self):
        catalog = main._load_menu_catalog_data()
        closed = {**catalog, 'stalls': [{**catalog['stalls'][0], 'status': 'Closed'}]}
        with patch.object(main, '_load_menu_catalog_data', return_value=closed):
            stall = main._extract_menu_snapshot()['stalls'][0]
            self.assertFalse(stall['isOpen'])
            self.assertEqual(stall['availability'], 'closed')

    def test_show_time_uses_singapore_timezone_and_rolls_forward(self):
        self.assertEqual(main._minutes_until_show(datetime(2026, 9, 6, 11, 30, tzinfo=timezone.utc)), 15)
        self.assertEqual(main._minutes_until_show(datetime(2026, 9, 6, 12, 0, tzinfo=timezone.utc)), 1425)


if __name__ == '__main__':
    unittest.main()
