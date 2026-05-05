import { ReactNode } from "react";

interface ConsumerLayoutProps {
  children: ReactNode;
  venueName?: string;
}

const ConsumerLayout = ({ children }: ConsumerLayoutProps) => {
  return (
    <div
      className="min-h-screen bg-background text-foreground max-w-md mx-auto relative"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {children}
    </div>
  );
};

export default ConsumerLayout;
