import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { optimizedImageUrl } from "@/lib/image-utils";

export interface UpsellSuggestion {
  item_id: string;
  name: string;
  price: number;
  image_url: string | null;
  suggestion_text: string;
}

interface UpsellPromptProps {
  suggestion: UpsellSuggestion;
  onAdd: (item: { id: string; name: string; price: number }) => void;
  onDismiss: () => void;
}

const UpsellPrompt = ({ suggestion, onAdd, onDismiss }: UpsellPromptProps) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Slide in
    const t = setTimeout(() => setVisible(true), 50);
    // Auto-dismiss after 5s
    const autoDismiss = setTimeout(() => handleDismiss(), 5000);
    return () => {
      clearTimeout(t);
      clearTimeout(autoDismiss);
    };
  }, []);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  const handleAdd = () => {
    onAdd({ id: suggestion.item_id, name: suggestion.name, price: suggestion.price });
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 z-50 transition-all duration-300 ease-out ${
        visible && !exiting
          ? "translate-y-0 opacity-100"
          : "translate-y-8 opacity-0"
      }`}
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg p-4 flex items-center gap-3">
        {suggestion.image_url && (
          <img
            src={optimizedImageUrl(suggestion.image_url, 112, 80, 112)}
            alt={suggestion.name}
            className="w-14 h-14 rounded-xl object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{suggestion.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {suggestion.suggestion_text}
          </p>
          <p className="text-sm font-medium text-primary mt-0.5">
            ${suggestion.price.toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAdd}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
          <button
            onClick={handleDismiss}
            className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpsellPrompt;
