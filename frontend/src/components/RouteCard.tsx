import React from 'react';
import type { HawkerRoutePlan } from '../types/route';

interface RouteCardProps {
  plan: HawkerRoutePlan;
}

export const RouteCard: React.FC<RouteCardProps> = ({ plan }) => {
  return (
    <section className="card route-card">
      <div className="card-header-row">
        <span className="badge badge-accent">⏱️ Timed Hawker Route</span>
        <span className={`badge ${plan.countdownUrgent ? 'badge-timer' : 'badge-accent'}`}>
          {plan.countdown}
        </span>
      </div>

      <div className="route-target-box">
        <span className="target-flag">📍 Target Destination</span>
        <h3>{plan.targetDestination}</h3>
        <p className="target-sub">{plan.targetNote}</p>
      </div>

      <div className="route-steps">
        {plan.steps.map((step) => {
          const isSwapped = step.statusType === 'swapped';
          return (
            <div
              key={step.id}
              className="route-step active"
              style={
                isSwapped
                  ? {
                      borderColor: 'rgba(245, 158, 11, 0.6)',
                      background: 'rgba(245, 158, 11, 0.12)',
                    }
                  : undefined
              }
            >
              <div
                className="step-badge"
                style={isSwapped ? { background: 'var(--satay-amber)' } : undefined}
              >
                {step.stepNumber}
              </div>
              <div className="step-details">
                <div className="step-title-row">
                  <strong className="step-name">{step.stallName}</strong>
                  <span
                    className={`step-status ${
                      step.statusType === 'ready'
                        ? 'status-ready'
                        : step.statusType === 'swapped'
                        ? 'status-ready'
                        : 'status-cooking'
                    }`}
                  >
                    {step.statusLabel}
                  </span>
                </div>
                <p className="step-desc">{step.itemDescription}</p>
                <span className="step-meta">{step.meta}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="route-summary">
        <div className="summary-line">
          <span>Estimated Total:</span>
          <strong className="price-val">{plan.totalCost}</strong>
        </div>
        <div className="summary-line">
          <span>Safety Buffer:</span>
          <span className="walk-badge">{plan.walkBuffer}</span>
        </div>
      </div>
    </section>
  );
};
