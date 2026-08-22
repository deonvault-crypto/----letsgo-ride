import { ReactNode, createContext, useContext, useMemo, useState } from "react";

import { MenuItem, Restaurant } from "../types/food.types";

export type FoodBasketLine = {
  item: MenuItem;
  quantity: number;
};

type FoodBasketContextValue = {
  restaurant: Restaurant | null;
  lines: FoodBasketLine[];
  itemCount: number;
  subtotalUsd: number;
  addItem: (restaurant: Restaurant, item: MenuItem) => void;
  decrementItem: (itemId: string) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  clearBasket: () => void;
};

const FoodBasketContext = createContext<FoodBasketContextValue | null>(null);

export function FoodBasketProvider({ children }: { children: ReactNode }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [lines, setLines] = useState<FoodBasketLine[]>([]);

  function addItem(nextRestaurant: Restaurant, item: MenuItem) {
    setRestaurant((currentRestaurant) => {
      if (currentRestaurant && currentRestaurant.id !== nextRestaurant.id) {
        setLines([{ item, quantity: 1 }]);
        return nextRestaurant;
      }

      setLines((currentLines) => {
        const existing = currentLines.find((line) => line.item.id === item.id);
        if (!existing) return [...currentLines, { item, quantity: 1 }];
        return currentLines.map((line) =>
          line.item.id === item.id
            ? { ...line, quantity: Math.min(line.quantity + 1, 20) }
            : line,
        );
      });
      return nextRestaurant;
    });
  }

  function decrementItem(itemId: string) {
    setLines((currentLines) =>
      currentLines
        .map((line) =>
          line.item.id === itemId ? { ...line, quantity: line.quantity - 1 } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function setQuantity(itemId: string, quantity: number) {
    const safeQuantity = Math.max(0, Math.min(Math.floor(quantity), 20));
    setLines((currentLines) =>
      currentLines
        .map((line) =>
          line.item.id === itemId ? { ...line, quantity: safeQuantity } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function clearBasket() {
    setLines([]);
    setRestaurant(null);
  }

  const value = useMemo<FoodBasketContextValue>(() => ({
    restaurant,
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalUsd: Number(
      lines.reduce((total, line) => total + line.item.price_usd * line.quantity, 0).toFixed(2),
    ),
    addItem,
    decrementItem,
    setQuantity,
    clearBasket,
  }), [restaurant, lines]);

  return <FoodBasketContext.Provider value={value}>{children}</FoodBasketContext.Provider>;
}

export function useFoodBasket() {
  const context = useContext(FoodBasketContext);
  if (!context) {
    throw new Error("useFoodBasket must be used inside FoodBasketProvider.");
  }
  return context;
}
