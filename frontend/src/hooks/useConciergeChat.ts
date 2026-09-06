import { useState, useCallback, useRef, useEffect } from 'react';
import { createCheckout, submitOrder, generateDemoReceipt, formatPickupTime } from '../utils/checkout';
import { sanitizeForSpeech } from '../utils/speechSanitizer';
import { API_BASE_URL } from '../lib/api';
import { DISH_CATALOG } from '../constants/dishes';
import { checkPhoneticPreview } from '../utils/phonetic';
import type { FoodSpotlight } from '../components/FoodSpotlightCard';
import type { ChatMessage, FoodSuggestionAction } from '../types/chat';
import { addSelection, validMinutes } from '../utils/planSummary';
import { buildWelcomeMessage } from '../utils/persona';

interface UseConciergeChatOptions {
  selectedAvatar: string;
  personaName?: string;
  isAudioUnlocked: boolean;
  resumeAudio: () => Promise<void>;
  presentSentence: (sentence: string) => void;
  stopListening: () => void;
}

export function useConciergeChat({
  selectedAvatar,
  personaName = 'Mei',
  isAudioUnlocked,
  resumeAudio,
  presentSentence,
  stopListening,
}: UseConciergeChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: buildWelcomeMessage(personaName),
    },
  ]);
  const [foodSpotlight, setFoodSpotlight] = useState<FoodSpotlight>(DISH_CATALOG.satay);
  const [repairNoticeText, setRepairNoticeText] = useState<string | null>(null);

  // Sync welcome message if persona changes before conversation starts
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome-1') {
        const updatedContent = buildWelcomeMessage(personaName);
        if (prev[0].content !== updatedContent) {
          return [{ ...prev[0], content: updatedContent }];
        }
      }
      return prev;
    });
  }, [personaName]);

  const speakWelcome = useCallback(
    (name?: string) => {
      const targetName = name || personaName;
      const welcomeText = buildWelcomeMessage(targetName);
      const cleanSpeech = sanitizeForSpeech(welcomeText);
      if (cleanSpeech) {
        presentSentence(cleanSpeech);
      }
    },
    [personaName, presentSentence]
  );

  const speakMessage = useCallback(
    async (text: string) => {
      if (!isAudioUnlocked) {
        await resumeAudio().catch(() => {});
      }
      const cleanSpeech = sanitizeForSpeech(text);
      if (cleanSpeech) {
        presentSentence(cleanSpeech);
      }
    },
    [isAudioUnlocked, resumeAudio, presentSentence]
  );

  const checkout = useRef(
    createCheckout(async (dishId, food) => {
      try {
        return await submitOrder(API_BASE_URL, dishId);
      } catch {
        return generateDemoReceipt(food || { dishId, prepMinutes: 8, queueMinutes: 4 });
      }
    })
  );

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
                if (!parsed.delta.includes('<!--RECOMMEND:')) {
                  sentenceBuffer += parsed.delta;
                }

                const cleanDisplay = fullReply
                  .replace(/<!--[\s\S]*?(-->|$)/g, '')
                  .replace(/\*\*/g, '')
                  .trim();
                setMessages((prev) =>
                  prev.map((m) => (m.id === botMsgId ? { ...m, content: cleanDisplay } : m))
                );

                const cleanBuffer = sentenceBuffer.replace(/<!--[\s\S]*?(-->|$)/g, '');
                const match = cleanBuffer.match(/^(.*?[.!?](?!\d))(\s+.*|$)/s);
                if (match) {
                  const complete = match[1].trim();
                  sentenceBuffer = match[2] || '';
                  const cleanSpeech = sanitizeForSpeech(complete);
                  if (cleanSpeech) {
                    presentSentence(cleanSpeech);
                  }
                }
              }
            } catch (e) {}
          }
        }

        // Flush remaining sentence buffer (stripping any tags & formatting currency/numbers)
        const finalSpeech = sanitizeForSpeech(sentenceBuffer);
        if (finalSpeech) {
          presentSentence(finalSpeech);
        }

        // Dynamically extract LLM-powered Food Recommendation Action Tag
        const recommendMatch = fullReply.match(/<!--RECOMMEND:\s*(\{[\s\S]*?\})\s*-->/);
        let matchedFood: FoodSuggestionAction | undefined;
        const cleanFinalReply = fullReply
          .replace(/<!--[\s\S]*?(-->|$)/g, '')
          .replace(/\*\*/g, '')
          .trim();

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
                reason: parsed.reason ? String(parsed.reason) : undefined,
                portionNote: parsed.portionNote ? String(parsed.portionNote) : undefined,
              };

              // Dynamically sync the Featured Spotlight card with the LLM recommendation
              setFoodSpotlight({
                stallId: matchedFood.stallId,
                stallName: matchedFood.stallName,
                dishName: matchedFood.dishName,
                price: matchedFood.price,
                prepTime: matchedFood.prepTime || 'Unavailable',
                dietary: matchedFood.dietaryTags?.join(' · ') || 'Dietary information unavailable',
                description: matchedFood.reason || `Recommended by concierge from ${matchedFood.stallName}`,
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
        const pickupTime = formatPickupTime(receipt.estimatedPickupTime);
        const totalWait = (receipt.prepMinutes || 0) + (receipt.queueMinutes || 0);
        const waitDetails = receipt.queueMinutes && receipt.prepMinutes
          ? ` (queue ~${receipt.queueMinutes} mins + prep ~${receipt.prepMinutes} mins)`
          : '';

        const confirmationText = `Order confirmed at ${item.stallName}: ${item.dishName}. Queue #${receipt.queueNumber}. Estimated wait: ~${totalWait} mins${waitDetails}. Predicted pickup: ${pickupTime} (Singapore time). Collect at ${item.stallName}.`;

        setMessages((prev) => [...prev, {
          id: `receipt-${receipt.orderId}`,
          role: 'assistant',
          content: confirmationText,
        }]);

        // Voice the confirmation aloud through Perxona Avatar with sanitized speech
        if (!isAudioUnlocked) {
          await resumeAudio().catch(() => {});
        }
        const spokenReceipt = sanitizeForSpeech(
          `Order confirmed at ${item.stallName}: ${item.dishName}. Queue #${receipt.queueNumber}. Estimated wait: ~${totalWait} mins. Predicted pickup: ${pickupTime}. Collect at ${item.stallName}.`
        );
        if (spokenReceipt) {
          presentSentence(spokenReceipt);
        }
      }
    }, [isAudioUnlocked, resumeAudio, presentSentence]
  );

  return {
    messages,
    foodSpotlight,
    repairNoticeText,
    handleSendMessage,
    handleAddToCart,
    handleCheckout,
    speakWelcome,
    speakMessage,
  };
}
