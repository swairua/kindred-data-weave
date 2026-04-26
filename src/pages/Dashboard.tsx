import { useMemo } from "react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTestData, TestStatus } from "@/context/TestDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FlaskConical, Mountain, Hammer, TestTubeDiagonal,
  CheckCircle2, Clock, Circle, ArrowRight, BarChart3,
} from "lucide-react";

const statusConfig: Record<TestStatus, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof Circle }> = {
  "not-started": { label: "Not Started", variant: "outline", icon: Circle },
  "in-progress": { label: "In Progress", variant: "secondary", icon: Clock },
  "completed": { label: "Completed", variant: "default", icon: CheckCircle2 },
};

const categoryConfig = {
  soil: { label: "Soil Tests", icon: Mountain, color: "hsl(var(--primary))" },
  concrete: { label: "Concrete Tests", icon: Hammer, color: "hsl(var(--accent))" },
  rock: { label: "Rock Tests", icon: Mountain, color: "hsl(var(--warning))" },
  special: { label: "Special Tests", icon: TestTubeDiagonal, color: "hsl(var(--destructive))" },
};

const Dashboard = () => {
  const { tests } = useTestData();
  const navigate = useNavigate();

  const testList = useMemo(() => Object.values(tests), [tests]);

  const stats = useMemo(() => {
    const total = testList.length;
    const completed = testList.filter(t => t.status === "completed").length;
    const inProgress = testList.filter(t => t.status === "in-progress").length;
    const notStarted = testList.filter(t => t.status === "not-started").length;
    return { total, completed, inProgress, notStarted, progress: total ? Math.round((completed / total) * 100) : 0 };
  }, [testList]);

  const categories = useMemo(() => {
    const cats = ["soil", "concrete", "rock", "special"] as const;
    return cats.map(cat => ({
      key: cat,
      ...categoryConfig[cat],
      tests: testList.filter(t => t.category === cat),
      completed: testList.filter(t => t.category === cat && t.status === "completed").length,
      total: testList.filter(t => t.category === cat).length,
    }));
  }, [testList]);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Circle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.notStarted}</p>
                <p className="text-xs text-muted-foreground">Not Started</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Overall Progress</span>
            <span className="text-sm font-mono text-muted-foreground">{stats.progress}%</span>
          </div>
          <Progress value={stats.progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Category Sections */}
      {categories.map(cat => {
        const CatIcon = cat.icon;
        return (
          <div key={cat.key}>
            <div className="flex items-center gap-2 mb-3">
              <CatIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{cat.label}</h2>
              <Badge variant="secondary" className="text-xs ml-auto">{cat.completed}/{cat.total}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cat.tests.map(test => {
                const sc = statusConfig[test.status];
                const StatusIcon = sc.icon;
                return (
                  <Card key={test.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-sm font-medium">{test.name}</CardTitle>
                        <Badge variant={sc.variant} className="text-[10px] px-1.5 py-0 h-5 gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {test.keyResults.length > 0 ? (
                        <div className="space-y-1 mb-3">
                          {test.keyResults.slice(0, 3).map((r, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{r.label}</span>
                              <span className="font-mono font-medium text-foreground">{r.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mb-3">No data recorded yet</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{test.dataPoints} data point{test.dataPoints !== 1 ? "s" : ""}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-primary"
                          onClick={() => navigate("/tests")}
                        >
                          Open <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Dashboard;
