import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

export function DemoPill() {
  return (
    <div className="fixed bottom-6 right-6 z-40 hidden lg:block">
      <Button
        size="lg"
        className="rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 px-6"
        asChild
      >
        <a href="mailto:sales@hl-ordernow.com?subject=Book%20a%20demo">
          <Calendar className="mr-2 h-4 w-4" />
          Book a demo
        </a>
      </Button>
    </div>
  );
}
