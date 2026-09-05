import { pickupLabel } from '../utils/checkout';
import type { ChatMessage } from '../types/chat';
import { foodTiming, selectedPlanItems } from '../utils/planSummary';

export function PlanSummary({ messages }: { messages: ChatMessage[] }) {
  const items = selectedPlanItems(messages);
  const minutes = (value: number | undefined) => value === undefined ? 'Unavailable' : `${value} min`;
  return (
    <section className="card plan-summary" aria-labelledby="plan-summary-title">
      <h2 id="plan-summary-title">Plan Summary</h2>
      <p className="plan-estimate-note">Accelerated demo-simulation · estimates at selection or checkout</p>
      {items.length === 0 ? (
        <p className="plan-empty">Add food from the chat to see your hawker, food, and estimated wait here.</p>
      ) : (
        <ul className="plan-items">
          {items.map((message) => {
            const food = message.suggestedFood!;
            const timing = foodTiming(food);
            return (
              <li key={message.id} className="plan-item">
                <p className="plan-hawker">{food.stallName}</p>
                <h3>{food.dishName}</h3>
                <p>{food.price}</p>
                <dl className="plan-timing">
                  <div><dt>Preparation</dt><dd>{minutes(timing.prep)}</dd></div>
                  <div><dt>Queue</dt><dd>{minutes(timing.queue)}</dd></div>
                  <div><dt>Estimated wait</dt><dd>{minutes(timing.total)}</dd></div>
                </dl>
                <p className="plan-order-state">{message.orderState === 'checked_out'
                  ? `Checked out · Queue #${message.queueNumber ?? 'Unavailable'}` : message.orderState === 'submitting' ? 'Submitting order…' : 'Added to cart'}</p>
                {message.estimatedPickupTime && <p>Predicted simulated pickup: {pickupLabel(message.estimatedPickupTime)} SGT</p>}
                {message.checkoutError && <p role="alert">{message.checkoutError}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="plan-estimate-note">Food wait is preparation + queue. Dining and walking time are separate.</p>
    </section>
  );
}
