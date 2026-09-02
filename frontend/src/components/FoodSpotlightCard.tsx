import React from 'react';

export interface FoodSpotlight {
  stallId: number;
  stallName: string;
  dishName: string;
  price: string;
  prepTime: string;
  dietary: string;
  description: string;
  imageUrl: string;
}

interface FoodSpotlightCardProps {
  spotlight: FoodSpotlight;
  onOrderClick?: () => void;
}

export const FoodSpotlightCard: React.FC<FoodSpotlightCardProps> = ({
  spotlight,
  onOrderClick,
}) => {
  return (
    <section className="card food-spotlight-card">
      <div className="card-header-row">
        <span className="badge badge-accent">Featured Stall Spotlight</span>
        <span className="badge badge-live-sync">Synced with AI</span>
      </div>

      {/* Food Image Container */}
      <div className="food-image-container">
        <img
          src={spotlight.imageUrl}
          alt={spotlight.dishName}
          className="food-spotlight-img"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/satay_dish.jpg';
          }}
        />
        <div className="food-image-overlay">
          <span className="food-price-badge">{spotlight.price}</span>
          <span className="food-stall-badge">Stall {spotlight.stallId}</span>
        </div>
      </div>

      {/* Dish & Stall Details */}
      <div className="food-details">
        <h3 className="food-dish-title">{spotlight.dishName}</h3>
        <div className="food-stall-subtitle">{spotlight.stallName}</div>

        <div className="food-meta-tags">
          <span className="meta-tag meta-prep">{spotlight.prepTime}</span>
          <span className="meta-tag meta-dietary">{spotlight.dietary}</span>
        </div>

        <p className="food-description">{spotlight.description}</p>
      </div>

      {/* Action / Enticement CTA */}
      <button
        onClick={onOrderClick}
        className="btn-order-stall"
        title="Direct order route"
      >
        <span>Order at {spotlight.stallName}</span>
      </button>
    </section>
  );
};
