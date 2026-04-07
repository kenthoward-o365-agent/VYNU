import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SECTION_LABELS, SECTION_DESCRIPTIONS, type SectionType } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (type: SectionType) => void;
}

const sectionTypes: SectionType[] = [
  "hero", "table-display", "featured-items", "loyalty-cta",
  "hours-location", "social-links", "text", "divider", "spacer",
];

const SectionAddModal = ({ open, onClose, onAdd }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Section</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
          {sectionTypes.map((type) => (
            <button
              key={type}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              onClick={() => { onAdd(type); onClose(); }}
            >
              <span className="text-lg">{SECTION_LABELS[type].split(" ")[0]}</span>
              <div>
                <p className="text-sm font-medium">{SECTION_LABELS[type].slice(2).trim()}</p>
                <p className="text-xs text-muted-foreground">{SECTION_DESCRIPTIONS[type]}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SectionAddModal;
