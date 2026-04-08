import { ReactNode } from "react";

interface ConsumerLayoutProps {
  children: ReactNode;
  venueName?: string;
}

const ConsumerLayout = ({ children }: ConsumerLayoutProps) => {
  return (
    <div className="min-h-screen bg-background text-foreground max-w-md mx-auto relative overflow-x-hidden">
      {children}
    </div>
  );
};

export default ConsumerLayout;
