import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserCircle2 } from "lucide-react";

interface DinerResumeGateProps {
  firstName: string | null;
  email: string | null;
  onContinue: () => void;
  onSwitchAccount: () => void;
}

export default function DinerResumeGate({ firstName, email, onContinue, onSwitchAccount }: DinerResumeGateProps) {
  const displayName = firstName?.trim() || email?.split("@")[0] || "there";

  return (
    <div className="flex items-center justify-center min-h-screen px-6">
      <Card className="w-full max-w-sm p-6 space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-primary/10 p-4">
            <UserCircle2 className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Welcome back, {displayName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              We still have you signed in. Continue as you, or switch accounts.
            </p>
            {email && (
              <p className="text-xs text-muted-foreground mt-2 truncate">{email}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={onContinue}>
            Continue as {displayName}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={onSwitchAccount}
          >
            Not you? Sign in with a different account
          </Button>
        </div>
      </Card>
    </div>
  );
}
