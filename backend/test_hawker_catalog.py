"""Tests for the structured JSON restaurant catalog."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from backend import main as app


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.original_path = app.catalog_path
        self.document = json.loads(self.original_path.read_text(encoding='utf-8'))
        self.temp = tempfile.TemporaryDirectory(dir=app.PROJECT_ROOT)

    def tearDown(self):
        app.catalog_path = self.original_path
        app.MENU_CACHE_KEY = None
        app.MENU_CACHE = None
        app._load_menu_catalog_data()
        self.temp.cleanup()

    def load(self, document):
        path = Path(self.temp.name) / 'catalog.json'
        path.write_text(document if isinstance(document, str) else json.dumps(document), encoding='utf-8')
        app.catalog_path = path
        app.MENU_CACHE_KEY = None
        app.MENU_CACHE = None
        return app._load_menu_catalog_data()

    def test_all_choices_prices_and_sources(self):
        menu = self.load(self.document)
        self.assertEqual((len(menu['stalls']), len(menu['dishes'])), (15, 35))
        self.assertEqual([stall['id'] for stall in menu['stalls']], list(range(1, 16)))
        self.assertEqual(len({dish['id'] for dish in menu['dishes']}), 35)
        self.assertTrue(all(stall['basePrepMinutes'] > 0 for stall in menu['stalls']))
        self.assertTrue(all(stall['baseQueueMinutes'] >= 0 for stall in menu['stalls']))
        self.assertEqual(menu['source'], str(app.catalog_path))
        self.assertEqual(menu['sources'], [str(app.catalog_path)])
        stingray = next(dish for dish in menu['dishes'] if 'Stingray' in dish['name'])
        self.assertEqual(stingray['price'], 16.0)
        self.assertEqual(stingray['priceDisplay'], 'SGD $16.00 / $22.00')

    def test_normalizes_and_derives_optional_fields(self):
        satay = self.load(self.document)['dishes'][0]
        self.assertEqual(satay['tags'], ['gluten-free', 'halal'])
        self.assertEqual(satay['priceDisplay'], 'SGD $9.00')
        self.assertEqual(satay['imageUrl'], '/satay_dish.jpg')
        self.assertIn('City Satay', satay['description'])
        self.assertTrue(0 <= satay['popularity'] <= 100)

    def test_json_replaces_food_markdown_sources(self):
        self.assertEqual(self.original_path.name, 'restaurant_catalog.json')
        self.assertEqual(list((app.BACKEND_DIR / 'data' / 'hawkers').glob('*.md')), [])
        self.assertFalse((app.BACKEND_DIR / 'satay_by_the_bay.md').exists())

    def test_invalid_json_and_root_schema_fail(self):
        for document, message in [('{', 'invalid JSON'), ({}, 'schemaVersion'),
                                  ({'schemaVersion': 1, 'stalls': []}, 'non-empty array')]:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                self.load(document)

    def test_duplicate_ids_fail(self):
        broken = copy.deepcopy(self.document)
        broken['stalls'][1]['id'] = broken['stalls'][0]['id']
        with self.assertRaisesRegex(ValueError, 'duplicate stall ID'):
            self.load(broken)
        broken = copy.deepcopy(self.document)
        broken['stalls'][1]['dishes'][0]['id'] = broken['stalls'][0]['dishes'][0]['id']
        with self.assertRaisesRegex(ValueError, 'duplicate dish ID'):
            self.load(broken)

    def test_invalid_stall_and_dish_fields_fail(self):
        for field, value in [('basePrepMinutes', 0), ('baseQueueMinutes', -1)]:
            broken = copy.deepcopy(self.document)
            broken['stalls'][0][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                self.load(broken)
        for field, value in [('price', -1), ('tags', 'halal')]:
            broken = copy.deepcopy(self.document)
            broken['stalls'][0]['dishes'][0][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                self.load(broken)

    def test_catalog_change_invalidates_cache_and_prompt_data(self):
        first = self.load(self.document)
        changed = copy.deepcopy(self.document)
        changed['stalls'][0]['dishes'][0]['price'] = 9.25
        second = self.load(changed)
        self.assertNotEqual(first['version'], second['version'])
        self.assertEqual(second['dishes'][0]['price'], 9.25)
        self.assertEqual(json.loads(app.satay_kb)['dishes'][0]['price'], 9.25)

    def test_recommendations_use_json_timing(self):
        menu = self.load(self.document)
        result = app._recommend_food_from_context('I want laksa within 120 minutes')
        self.assertIn('Laksa', result['primary']['dishName'])
        stall = next(item for item in menu['stalls'] if item['id'] == result['primary']['stallId'])
        self.assertEqual(result['primary']['prepMinutes'], stall['basePrepMinutes'])
        self.assertEqual(result['primary']['queueMinutes'], stall['baseQueueMinutes'])
        self.assertEqual(result['primary']['estimatedTotalWait'],
                         result['primary']['prepMinutes'] + result['primary']['queueMinutes'])


if __name__ == '__main__':
    unittest.main()
