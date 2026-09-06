import React, { useEffect } from 'react';
import { pickupLabel } from '../utils/checkout';
import type { ChatMessage, FoodSuggestionAction } from '../types/chat';
import { foodTiming, selectedPlanItems } from '../utils/planSummary';

export interface PlanSummaryProps {
  messages: ChatMessage[];
  isOpen?: boolean;
  onClose?: () => void;
  onCheckout?: (messageId: string, food: FoodSuggestionAction) => void;
}

export function PlanSummary({ messages, isOpen, onClose, onCheckout }: PlanSummaryProps) {
  const items = selectedPlanItems(messages);
  const minutes = (value: number | undefined) => value === undefined ? 'Unavailable' : `${value} min`;

  // Close drawer on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // If explicitly closed in drawer mode, do not render
  if (isOpen === false) {
    return null;
  }

  const content = (
    <>
      <div className="cart-drawer-header">
        <div className="cart-drawer-title-wrap">
          <h2 id="plan-summary-title">Cart & Checkout</h2>
          <span className="cart-drawer-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
        </div>
        {onClose && (
          <button
            type="button"
            className="cart-drawer-close-btn"
            onClick={onClose}
            aria-label="Close cart"
            title="Close cart"
          >
            ✕
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="cart-empty-state">
          <div className="cart-empty-icon">🛒</div>
          <p className="plan-empty">Add food from the chat to see your hawker, food, and estimated wait here.</p>
        </div>
      ) : (
        <ul className="plan-items">
          {items.map((message) => {
            const food = message.suggestedFood!;
            const timing = foodTiming(food);
            const isCheckedOut = message.orderState === 'checked_out';
            const isSubmitting = message.orderState === 'submitting';

            return (
              <li key={message.id} className={`plan-item ${isCheckedOut ? 'item-confirmed' : ''}`}>
                <div className="plan-item-top">
                  {food.imageUrl && (
                    <img
                      src={food.imageUrl}
                      alt={food.dishName}
                      className="plan-item-thumb"
                      onError={(e) => {
                        (e.target as HTMLImageElement).onerror = null;
                        (e.target as HTMLImageElement).src = '/food-placeholder.svg';
                      }}
                    />
                  )}
                  <div className="plan-item-meta">
                    <p className="plan-hawker">{food.stallName}</p>
                    <h3>{food.dishName}</h3>
                    <p className="plan-price">{food.price}</p>
                    {food.reason && <p className="plan-item-reason">💡 {food.reason}</p>}
                  </div>
                </div>

                <dl className="plan-timing">
                  <div><dt>Preparation</dt><dd>{minutes(timing.prep)}</dd></div>
                  <div><dt>Queue</dt><dd>{minutes(timing.queue)}</dd></div>
                  <div><dt>Estimated wait</dt><dd>{minutes(timing.total)}</dd></div>
                </dl>

                <div className="plan-item-actions">
                  <p className="plan-order-state">
                    {isCheckedOut
                      ? `Checked out · Queue #${message.queueNumber ?? 'Unavailable'}`
                      : isSubmitting
                      ? 'Submitting order…'
                      : 'Added to cart'}
                  </p>

                  {!isCheckedOut && onCheckout && (
                    <button
                      type="button"
                      className="btn-drawer-checkout"
                      disabled={isSubmitting}
                      onClick={() => onCheckout(message.id, food)}
                    >
                      {isSubmitting ? 'Submitting…' : 'Checkout Now →'}
                    </button>
                  )}
                </div>

                {message.estimatedPickupTime && (
                  <p className="plan-pickup-time">
                    Predicted pickup: {pickupLabel(message.estimatedPickupTime)} SGT
                  </p>
                )}
                {message.checkoutError && <p role="alert" className="plan-error">{message.checkoutError}</p>}
              </li>
            );
          })}
        </ul>
      )}

    </>
  );

  // If rendered as drawer modal overlay
  if (isOpen === true) {
    return (
      <div className="cart-drawer-overlay">
        <div className="cart-drawer-backdrop" onClick={onClose} />
        <aside className="card plan-summary cart-drawer" aria-labelledby="plan-summary-title">
          {content}
        </aside>
      </div>
    );
  }

  // Standalone mode for tests or embedded fallback
  return (
    <section className="card plan-summary" aria-labelledby="plan-summary-title">
      {content}
    </section>
  );
}

export const CartDrawer = PlanSummary;
