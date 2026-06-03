import { Link } from "react-router-dom";
import { Check, AlertCircle, Circle, MinusCircle, ExternalLink, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReadinessResult, StageStatus } from "./useOnboardingReadiness";

function statusIcon(s: StageStatus) {
  if (s === "done") return <Check className="h-4 w-4 text-emerald-500" />;
  if (s === "in_progress") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  if (s === "n_a") return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

interface Props {
  data: ReadinessResult;
  onGoLive: () => void;
  onAskAgent: (stageId: string) => void;
  goingLive?: boolean;
}

export function ChecklistPane({ data, onGoLive, onAskAgent, goingLive }: Props) {
  return (
    <div className="flex h-full flex-col bg-card border-r border-border">
      <div className="p-5 border-b border-border space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-foreground">Go-Live Checklist</h2>
          <span className="text-sm text-muted-foreground">{data.blockers_done}/{data.blockers_total} blockers</span>
        </div>
        <Progress value={data.score} className="h-2" />
        <div className="flex items-center justify-between">
          <Badge variant={data.ready_to_go_live ? "default" : "secondary"}>
            {data.score}% ready
          </Badge>
          {data.is_live && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Live</Badge>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {data.stages.map((s) => (
          <div key={s.id} className={cn(
            "rounded-md border border-border bg-background p-3 text-sm",
            s.status === "done" && "opacity-80",
          )}>
            <div className="flex items-start gap-2">
              {statusIcon(s.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{s.title}</span>
                  {s.blocker && s.status !== "n_a" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">required</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.deep_link && s.status !== "done" && (
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Link to={s.deep_link}>
                        Open <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                  {s.status !== "done" && s.status !== "n_a" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onAskAgent(s.id)}>
                      Ask agent
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border">
        <Button
          className="w-full"
          disabled={!data.ready_to_go_live || data.is_live || goingLive}
          onClick={onGoLive}
        >
          <Rocket className="mr-2 h-4 w-4" />
          {data.is_live ? "You're Live!" : goingLive ? "Going live..." : "Go Live"}
        </Button>
        {!data.ready_to_go_live && !data.is_live && (
          <p className="mt-2 text-xs text-muted-foreground text-center">
            Complete the required steps to enable Go Live.
          </p>
        )}
      </div>
    </div>
  );
}
