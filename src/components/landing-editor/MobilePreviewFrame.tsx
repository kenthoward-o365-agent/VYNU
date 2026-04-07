import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

const MobilePreviewFrame = ({ children }: Props) => {
  return (
    <div className="flex items-start justify-center p-6 overflow-y-auto h-full bg-muted/30">
      <div className="relative" style={{ width: 375 }}>
        {/* Phone frame */}
        <div className="rounded-[2.5rem] border-4 border-foreground/20 bg-black overflow-hidden shadow-2xl">
          {/* Notch */}
          <div className="flex justify-center pt-2 pb-1 bg-black">
            <div className="w-28 h-6 bg-foreground/20 rounded-full" />
          </div>
          {/* Screen content */}
          <div className="overflow-y-auto" style={{ height: 700 }}>
            {children}
          </div>
          {/* Home indicator */}
          <div className="flex justify-center py-2 bg-black">
            <div className="w-32 h-1 bg-foreground/30 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobilePreviewFrame;
