import type { FoodSpotlight } from '../components/FoodSpotlightCard';

export const DISH_CATALOG: Record<string, FoodSpotlight> = {
  satay: {
    stallId: 1,
    stallName: 'City Satay (Stall 1)',
    dishName: 'Charcoal-Grilled Chicken & Beef Satay',
    price: 'SGD $9.00',
    prepTime: '~15 mins (Grill Queue: 20 mins)',
    dietary: '100% Halal Certified',
    description:
      'Tender marinated skewers grilled over hot mangrove charcoal, served with warm spiced peanut sauce, cucumbers, and steamed ketupat.',
    imageUrl: '/satay_dish.jpg',
  },
  prata: {
    stallId: 4,
    stallName: 'Garden Greens & Prata House (Stall 4)',
    dishName: 'Crispy Plain & Egg Prata with Dhal Curry',
    price: 'SGD $3.50',
    prepTime: '~6 mins (Fast Pickup)',
    dietary: 'Vegetarian & Nut-Free',
    description:
      'Hand-stretched golden layered flatbread, pan-fried to crisp perfection and served with house-made aromatic vegetable dhal curry.',
    imageUrl: '/prata_dish.jpg',
  },
};
