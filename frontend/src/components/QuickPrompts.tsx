import React from 'react';

interface QuickPromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

const DEMO_PROMPTS = [
  {
    id: 'halal-rush',
    label: '⏱️ 40m Rush (Halal Group)',
    prompt:
      'We have 40 mins before the 7:45 PM Supertree show, family of 3, Halal food under $30! What is our best plan?',
  },
  {
    id: 'vegetarian',
    label: '🥗 Vegetarian & Nut-Free',
    prompt:
      'I am vegetarian and allergic to peanuts. What can I get before heading to the Supertree show?',
  },
  {
    id: 'replan',
    label: '🚨 Auto-Replan (Queue Delay)',
    prompt:
      'Satay queue is now 25 minutes delay! We need to leave in 20 minutes, please replan our order!',
  },
];

export const QuickPrompts: React.FC<QuickPromptsProps> = ({ onSelectPrompt }) => {
  return (
    <section className="card quick-card">
      <h3 className="card-title">⚡ Quick Demo Scenarios</h3>
      <div className="prompt-chips">
        {DEMO_PROMPTS.map((item) => (
          <button
            key={item.id}
            className="chip-btn"
            onClick={() => onSelectPrompt(item.prompt)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
};
