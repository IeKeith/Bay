import { useState, useCallback, useRef } from 'react';
import { createCheckout, submitOrder } from '../utils/checkout';
import { API_BASE_URL } from '../lib/api';
import { DISH_CATALOG } from '../constants/dishes';
import { checkPhoneticPreview } from '../utils/phonetic';
import type { FoodSpotlight } from '../components/FoodSpotlightCard';
import type { ChatMessage, FoodSuggestionAction } from '../types/chat';
import { addSelection, validMinutes } from '../utils/planSummary';

interface UseConciergeChatOptions {
  selectedAvatar: string;
  isAudioUnlocked: boolean;
  resumeAudio: () => Promise<void>;
  presentSentence: (sentence: string) => void;
  stopListening: () => void;
}

export function useConciergeChat({
  selectedAvatar,
  isAudioUnlocked,
  resumeAudio,
  presentSentence,
  stopListening,
}: UseConciergeChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        "Welcome to Satay by the Bay! I'm Mei, your culinary route guide. Tell me your party size, dietary needs, or budget, and I'll route your orders so you arrive at the **7:45 PM Supertree Light Show** with time to spare!",
    },
  ]);
  const [foodSpotlight, setFoodSpotlight] = useState<FoodSpotlight>(DISH_CATALOG.satay);
  const [repairNoticeText, setRepairNoticeText] = useState<string | null>(null);

  const checkout = useRef(createCheckout((dishId) => submitOrder(API_BASE_URL, dishId)));

  // Send Message & Stream LLM Response
  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      stopListening();
      if (!isAudioUnlocked) {
        await resumeAudio();
      }

      // Phonetic preview notice
      const repair = checkPhoneticPreview(text);
      if (repair) {
        setRepairNoticeText(repair);
        setTimeout(() => setRepairNoticeText(null), 4000);
      }

      // Append User Message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Sync Food Spotlight with User Input
      const lowerText = text.toLowerCase();
      if (
        lowerText.includes('prata') ||
        lowerText.includes('vegetarian') ||
        lowerText.includes('replan') ||
        lowerText.includes('delay') ||
        lowerText.includes('green') ||
        lowerText.includes('nut')
      ) {
        setFoodSpotlight(DISH_CATALOG.prata);
      } else if (
        lowerText.includes('satay') ||
        lowerText.includes('halal') ||
        lowerText.includes('chicken') ||
        lowerText.includes('rush') ||
        lowerText.includes('beef')
      ) {
        setFoodSpotlight(DISH_CATALOG.satay);
      }

      // Prepare Assistant Message
      const botMsgId = `bot-${Date.now()}`;
      const initialBotMsg: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        content: '...',
      };
      setMessages((prev) => [...prev, initialBotMsg]);

      let fullReply = '';
      let sentenceBuffer = '';

      try {
        const res = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            avatarId: selectedAvatar,
            history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let done = false;
        let pendingStreamText = '';
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          if (readerDone) break;

          const chunk = decoder.decode(value, { stream: true });
          pendingStreamText += chunk;
          const lines = pendingStreamText.split('\n');
          pendingStreamText = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              done = true;
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.delta) {
                fullReply += parsed.delta;
                sentenceBuffer += parsed.delta;

                const cleanDisplay = fullReply.replace(/<!--[\s\S]*?(-->|$)/g, '').trim();
                setMessages((prev) =>
                  prev.map((m) => (m.id === botMsgId ? { ...m, content: cleanDisplay } : m))
                );

                // Sentence-by-sentence streaming into presenter (stripping any tags)
                const match = sentenceBuffer.match(/^(.*?[.!?])(\s+.*|$)/s);
                if (match) {
                  const complete = match[1].trim();
                  sentenceBuffer = match[2] || '';
                  const cleanSpeech = complete.replace(/<!--[\s\S]*?(-->|$)/g, '').trim();
                  if (cleanSpeech) {
                    presentSentence(cleanSpeech);
                  }
                }
              }
            } catch (e) {}
          }
        }

        // Flush remaining sentence buffer (stripping any tags)
        const finalSpeech = sentenceBuffer.replace(/<!--[\s\S]*?(-->|$)/g, '').trim();
        if (finalSpeech) {
          presentSentence(finalSpeech);
        }

        // Dynamically extract LLM-powered Food Recommendation Action Tag
        const recommendMatch = fullReply.match(/<!--RECOMMEND:\s*(\{[\s\S]*?\})\s*-->/);
        let matchedFood: FoodSuggestionAction | undefined;
        const cleanFinalReply = fullReply.replace(/<!--[\s\S]*?(-->|$)/g, '').trim();

        if (recommendMatch) {
          try {
            const parsed = JSON.parse(recommendMatch[1]);
            if (parsed && parsed.dishName && parsed.stallName) {
              const fallbackImage = '/food-placeholder.svg';
              const resolvedImage = parsed.imageUrl ? String(parsed.imageUrl) : fallbackImage;

              matchedFood = {
                dishId: parsed.dishId,
                simulationTimestamp: parsed.simulationTimestamp,
                estimatedPickupTime: parsed.estimatedPickupTime,
                stallId: Number(parsed.stallId) || 1,
                stallName: String(parsed.stallName),
                dishName: String(parsed.dishName),
                price: String(parsed.price || 'SGD $9.00'),
                prepTime: parsed.prepTime ? String(parsed.prepTime) : undefined,
                prepMinutes: validMinutes(parsed.prepMinutes),
                queueMinutes: validMinutes(parsed.queueMinutes),
                estimatedTotalWait: validMinutes(parsed.estimatedTotalWait),
                dietaryTags: Array.isArray(parsed.dietaryTags) ? parsed.dietaryTags.filter((tag: unknown) => typeof tag === 'string') : [],
                imageUrl: resolvedImage,
              };

              // Dynamically sync the Featured Spotlight card with the LLM recommendation
              setFoodSpotlight({
                stallId: matchedFood.stallId,
                stallName: matchedFood.stallName,
                dishName: matchedFood.dishName,
                price: matchedFood.price,
                prepTime: matchedFood.prepTime || 'Unavailable',
                dietary: matchedFood.dietaryTags?.join(' · ') || 'Dietary information unavailable',
                description: `Recommended by concierge from ${matchedFood.stallName}`,
                imageUrl: resolvedImage,
              });
            }
          } catch (err) {
            console.warn('[ConciergeChat] Could not parse LLM recommendation tag:', err);
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? {
                  ...m,
                  content: cleanFinalReply,
                  suggestedFood: matchedFood,
                  orderState: matchedFood ? 'idle' : undefined,
                }
              : m
          )
        );

      } catch (err: any) {
        console.error('[ConciergeChat] Chat error:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId ? { ...m, content: `_Apologies, connection issue: ${err.message}_` } : m
          )
        );
      }
    },
    [
      isAudioUnlocked,
      messages,
      presentSentence,
      resumeAudio,
      selectedAvatar,
      stopListening,
    ]
  );

  const handleAddToCart = useCallback((messageId: string, _item: FoodSuggestionAction) => {
    setMessages((prev) => addSelection(prev, messageId));
  }, []);

  const handleCheckout = useCallback(
    async (messageId: string, item: FoodSuggestionAction) => {
      const receipt = await checkout.current(messageId, item, (state, order, error) => {
        setMessages((prev) => prev.map((m) => m.id === messageId ? {
          ...m, orderState: state, checkoutError: error,
          ...(order ? {
            queueNumber: order.queueNumber, orderId: order.orderId,
            estimatedPickupTime: order.estimatedPickupTime,
            suggestedFood: { ...item, ...order },
          } : {}),
        } : m));
      });
      if (receipt) {
        setMessages((prev) => [...prev, {
          id: `receipt-${receipt.orderId}`, role: 'assistant',
          content: `Order confirmed at ${item.stallName}: ${item.dishName}. Queue #${receipt.queueNumber}. Accelerated demo-simulation: queue ${receipt.queueMinutes} min + preparation ${receipt.prepMinutes} min. Predicted pickup: ${receipt.estimatedPickupTime} (Singapore). Collect at ${item.stallName}.`,
        }]);
      }
    }, []
  );

  return {
    messages,
    foodSpotlight,
    repairNoticeText,
    handleSendMessage,
    handleAddToCart,
    handleCheckout,
  };
}
