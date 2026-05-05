import { ReactNode } from "react";

interface ConsumerLayoutProps {
  children: ReactNode;
  venueName?: string;
}

const ConsumerLayout = ({ children }: ConsumerLayoutProps) => {
  return (
    <div
      className="bg-background text-foreground max-w-md mx-auto relative overflow-x-hidden"
      style={{
        minHeight: "100dvh",
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
