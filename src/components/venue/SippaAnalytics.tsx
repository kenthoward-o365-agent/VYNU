import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { MessageSquare, ShoppingCart, TrendingUp, Clock, Sparkles, Users } from "lucide-react";
import { startOfDay, endOfDay, subDays, format } from "date-fns";

interface Props {
  venueId: string;
}

interface SessionData {
  id: string;
  message_count: number;
  items_added: number;
  converted_to_order: boolean;
  started_at: string;
  ended_at: string | null;
}

interface MessageData {
  content: string;
  role: string;
  had_items_added: boolean;
  created_at: string;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground) / 0.3)"];

export default function SippaAnalytics({ venueId }: Props) {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [range, setRange] = useState("7");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const days = parseInt(range);
      const from = startOfDay(subDays(new Date(), days)).toISOString();
      const to = endOfDay(new Date()).toISOString();

      const [sessRes, msgRes] = await Promise.all([
        supabase
          .from("chat_sessions")
          .select("id, message_count, items_added, converted_to_order, started_at, ended_at")
          .eq("venue_id", venueId)
          .gte("started_at", from)
          .lte("started_at", to)
          .order("started_at", { ascending: false }),
        supabase
          .from("chat_messages_log")
          .select("content, role, had_items_added, created_at")
          .eq("venue_id", venueId)
          .eq("role", "user")
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      setSessions((sessRes.data || []) as SessionData[]);
      setMessages((msgRes.data || []) as MessageData[]);
      setLoading(false);
    };
    fetchData();
  }, [venueId, range]);

  // Computed metrics
  const totalSessions = sessions.length;
  const totalMessages = sessions.reduce((sum, s) => sum + s.message_count, 0);
  const totalItemsAdded = sessions.reduce((sum, s) => sum + s.items_added, 0);
  const convertedSessions = sessions.filter((s) => s.converted_to_order).length;
  const conversionRate = totalSessions > 0 ? Math.round((convertedSessions / totalSessions) * 100) : 0;
  const avgMessages = totalSessions > 0 ? (totalMessages / totalSessions).toFixed(1) : "0";
  const avgItems = totalSessions > 0 ? (totalItemsAdded / totalSessions).toFixed(1) : "0";

  // Sessions by day for bar chart
  const sessionsByDay: Record<string, { date: string; sessions: number; conversions: number }> = {};
  sessions.forEach((s) => {
    const day = format(new Date(s.started_at), "MMM d");
    if (!sessionsByDay[day]) sessionsByDay[day] = { date: day, sessions: 0, conversions: 0 };
    sessionsByDay[day].sessions++;
    if (s.converted_to_order) sessionsByDay[day].conversions++;
  });
  const dailyData = Object.values(sessionsByDay).reverse();

  // Popular queries — simple word frequency from user messages
  const queryWords: Record<string, number> = {};
  messages.forEach((m) => {
    const words = m.content.toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !["what", "have", "that", "this", "with", "from", "your", "want", "like", "some", "please", "could", "would", "something", "anything"].includes(w));
    words.forEach((w) => { queryWords[w] = (queryWords[w] || 0) + 1; });
  });
  const topQueries = Object.entries(queryWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Conversion pie data
  const conversionPie = [
    { name: "Converted", value: convertedSessions },
    { name: "Not converted", value: totalSessions - convertedSessions },
  ];

  if (loading) {
    return <p className="text-muted-foreground">Loading analytics...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Sippa AI Analytics
          </h3>
          <p className="text-sm text-muted-foreground">Chat performance and diner engagement</p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSessions}</p>
                <p className="text-xs text-muted-foreground">Chat Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{conversionRate}%</p>
                <p className="text-xs text-muted-foreground">Conversion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgItems}</p>
                <p className="text-xs text-muted-foreground">Avg Items / Session</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgMessages}</p>
                <p className="text-xs text-muted-foreground">Avg Messages / Session</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions by Day */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sessions & Conversions by Day</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="sessions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Sessions" />
                  <Bar dataKey="conversions" fill="hsl(var(--primary) / 0.4)" radius={[4, 4, 0, 0]} name="Conversions" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                No chat sessions yet in this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {totalSessions > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={conversionPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      dataKey="value"
                      stroke="none"
                    >
                      {conversionPie.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    Converted ({convertedSessions})
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    No order ({totalSessions - convertedSessions})
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Popular Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Popular Topics</CardTitle>
          <CardDescription>Most common words in diner messages</CardDescription>
        </CardHeader>
        <CardContent>
          {topQueries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topQueries.map(([word, count]) => (
                <Badge key={word} variant="secondary" className="text-sm px-3 py-1">
                  {word} <span className="ml-1.5 text-muted-foreground">({count})</span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No messages logged yet</p>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Messages</p>
              <p className="text-lg font-semibold">{totalMessages}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Items Added via Chat</p>
              <p className="text-lg font-semibold">{totalItemsAdded}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Diner Messages Logged</p>
              <p className="text-lg font-semibold">{messages.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Orders from Chat</p>
              <p className="text-lg font-semibold">{convertedSessions}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
