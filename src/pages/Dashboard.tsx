import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTestData, TestStatus, TestSummary } from "@/context/TestDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Mountain, Hammer, TestTubeDiagonal,
  CheckCircle2, Clock, Circle, ArrowRight, BarChart3,
  TrendingUp, Eye, EyeOff, Filter, ChevronRight, Zap,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";

const statusConfig: Record<TestStatus, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof Circle; color: string; bgColor: string }> = {
  "not-started": { label: "Not Started", variant: "outline", icon: Circle, color: "text-slate-600", bgColor: "bg-slate-50 dark:bg-slate-900" },
  "in-progress": { label: "In Progress", variant: "secondary", icon: Clock, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-900" },
  "completed": { label: "Completed", variant: "default", icon: CheckCircle2, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-900" },
};

const categoryConfig = {
  soil: { label: "Soil Tests", icon: Mountain, gradientFrom: "from-amber-500", gradientTo: "to-orange-500", lightBg: "bg-amber-50 dark:bg-amber-950" },
  concrete: { label: "Concrete Tests", icon: Hammer, gradientFrom: "from-blue-500", gradientTo: "to-cyan-500", lightBg: "bg-blue-50 dark:bg-blue-950" },
  rock: { label: "Rock Tests", icon: Mountain, gradientFrom: "from-slate-500", gradientTo: "to-gray-500", lightBg: "bg-slate-50 dark:bg-slate-950" },
  special: { label: "Special Tests", icon: TestTubeDiagonal, gradientFrom: "from-purple-500", gradientTo: "to-pink-500", lightBg: "bg-purple-50 dark:bg-purple-950" },
};

const Dashboard = () => {
  const { tests } = useTestData();
  const navigate = useNavigate();
  const [selectedTest, setSelectedTest] = useState<TestSummary | null>(null);
  const [showDisabled, setShowDisabled] = useState(true);

  const testList = useMemo(() => Object.values(tests), [tests]);

  const visibleTests = useMemo(() => {
    return testList.filter(t => {
      if (!showDisabled && t.enabled === false) return false;
      return true;
    });
  }, [testList, showDisabled]);

  const stats = useMemo(() => {
    const total = visibleTests.length;
    const completed = visibleTests.filter(t => t.status === "completed").length;
    const inProgress = visibleTests.filter(t => t.status === "in-progress").length;
    const notStarted = visibleTests.filter(t => t.status === "not-started").length;
    const enabled = visibleTests.filter(t => t.enabled !== false).length;
    return { total, completed, inProgress, notStarted, enabled, progress: total ? Math.round((completed / total) * 100) : 0 };
  }, [visibleTests]);

  const categories = useMemo(() => {
    const cats = ["soil", "concrete", "rock", "special"] as const;
    return cats.map(cat => ({
      key: cat,
      ...categoryConfig[cat],
      tests: visibleTests.filter(t => t.category === cat),
      completed: visibleTests.filter(t => t.category === cat && t.status === "completed").length,
      total: visibleTests.filter(t => t.category === cat).length,
    }));
  }, [visibleTests]);

  return (
    <div className="space-y-8">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Testing Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage all laboratory tests</p>
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            pressed={!showDisabled}
            onPressedChange={(pressed) => setShowDisabled(!pressed)}
            className="gap-2"
            title="Hide disabled tests"
          >
            {showDisabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="text-xs hidden sm:inline">Disabled</span>
          </Toggle>
        </div>
      </div>

      {/* Summary Stats - Enhanced with animations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group overflow-hidden relative">
          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-300"></div>
          <CardContent className="pt-6 pb-6 relative z-10">
            <div className="flex items-start justify-between mb-3">
              <BarChart3 className="h-6 w-6 text-blue-100 group-hover:scale-110 transition-transform duration-300" />
              <span className="text-xs font-semibold text-blue-100 bg-blue-400/30 px-2 py-1 rounded-full backdrop-blur">Total</span>
            </div>
            <p className="text-4xl font-bold group-hover:text-blue-100 transition-colors duration-300">{stats.total}</p>
            <p className="text-sm text-blue-100 mt-2">Tests in System</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group overflow-hidden relative">
          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-300"></div>
          <CardContent className="pt-6 pb-6 relative z-10">
            <div className="flex items-start justify-between mb-3">
              <CheckCircle2 className="h-6 w-6 text-green-100 group-hover:scale-110 transition-transform duration-300" />
              <span className="text-xs font-semibold text-green-100 bg-green-400/30 px-2 py-1 rounded-full backdrop-blur">{stats.completed > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</span>
            </div>
            <p className="text-4xl font-bold group-hover:text-green-100 transition-colors duration-300">{stats.completed}</p>
            <p className="text-sm text-green-100 mt-2">Completed</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group overflow-hidden relative">
          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-300"></div>
          <CardContent className="pt-6 pb-6 relative z-10">
            <div className="flex items-start justify-between mb-3">
              <Clock className="h-6 w-6 text-amber-100 group-hover:scale-110 transition-transform duration-300" />
              <span className="text-xs font-semibold text-amber-100 bg-amber-400/30 px-2 py-1 rounded-full backdrop-blur">{stats.inProgress > 0 ? Math.round((stats.inProgress / stats.total) * 100) : 0}%</span>
            </div>
            <p className="text-4xl font-bold group-hover:text-amber-100 transition-colors duration-300">{stats.inProgress}</p>
            <p className="text-sm text-amber-100 mt-2">In Progress</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group overflow-hidden relative">
          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-300"></div>
          <CardContent className="pt-6 pb-6 relative z-10">
            <div className="flex items-start justify-between mb-3">
              <Circle className="h-6 w-6 text-slate-200 group-hover:scale-110 transition-transform duration-300" />
              <span className="text-xs font-semibold text-slate-200 bg-slate-500/30 px-2 py-1 rounded-full backdrop-blur">{stats.notStarted > 0 ? Math.round((stats.notStarted / stats.total) * 100) : 0}%</span>
            </div>
            <p className="text-4xl font-bold group-hover:text-slate-100 transition-colors duration-300">{stats.notStarted}</p>
            <p className="text-sm text-slate-200 mt-2">Not Started</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 hover:-translate-y-2 cursor-pointer group overflow-hidden relative">
          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity duration-300"></div>
          <CardContent className="pt-6 pb-6 relative z-10">
            <div className="flex items-start justify-between mb-3">
              <Zap className="h-6 w-6 text-cyan-100 group-hover:animate-pulse transition-colors duration-300" />
              <span className="text-xs font-semibold text-cyan-100 bg-cyan-400/30 px-2 py-1 rounded-full backdrop-blur">Active</span>
            </div>
            <p className="text-4xl font-bold group-hover:text-cyan-100 transition-colors duration-300">{stats.enabled}</p>
            <p className="text-sm text-cyan-100 mt-2">Enabled Tests</p>
          </CardContent>
        </Card>
      </div>

      {/* Overall Progress - Modern with animations */}
      <Card className="border-2 border-primary/30 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/5 hover:border-primary/50 transition-all duration-300 shadow-md hover:shadow-lg group overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <CardContent className="pt-6 pb-6 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-300">Overall Project Progress</span>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.completed} of {stats.total} tests completed
              </p>
            </div>
            <div className="text-right ml-4">
              <p className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300 origin-right">
                {stats.progress}%
              </p>
            </div>
          </div>
          <div className="relative">
            <Progress
              value={stats.progress}
              className="h-4 bg-primary/10 rounded-full overflow-hidden shadow-sm"
            />
            {/* Shimmer effect on progress bar */}
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-all duration-1000 ease-in-out"
              style={{
                width: `${stats.progress}%`,
                animation: 'shimmer 2s infinite'
              }}
            ></div>
          </div>
        </CardContent>
      </Card>

      {/* Category Sections - Modern with animations */}
      {categories.filter(c => c.total > 0).map((cat, catIdx) => {
        const CatIcon = cat.icon;
        return (
          <div key={cat.key} style={{ animationDelay: `${catIdx * 100}ms` }} className="animate-fade-in opacity-0">
            <div className="flex items-center gap-3 mb-4 p-4 rounded-lg bg-gradient-to-r from-white/50 to-transparent dark:from-slate-800/30 backdrop-blur-sm border border-primary/10 hover:border-primary/30 transition-all duration-300 group">
              <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${cat.gradientFrom} ${cat.gradientTo} flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300`}>
                <CatIcon className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors duration-300">{cat.label}</h2>
                <p className="text-xs text-muted-foreground">{cat.total} tests available</p>
              </div>
              <Badge className="text-sm px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-300 flex-shrink-0">
                {cat.completed}/{cat.total}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max">
              {cat.tests.map((test, idx) => {
                const sc = statusConfig[test.status];
                const StatusIcon = sc.icon;
                const isDisabled = test.enabled === false;
                return (
                  <Card
                    key={test.id}
                    className={`group cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 hover:-translate-y-2 border-2 transform origin-bottom ${isDisabled ? "opacity-60" : ""} ${sc.bgColor} overflow-hidden relative`}
                    onClick={() => setSelectedTest(test)}
                    style={{
                      animationDelay: `${idx * 50}ms`,
                      animation: 'fadeInUp 0.5s ease-out forwards'
                    }}
                  >
                    {/* Animated background gradient on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/0 group-hover:from-white/10 group-hover:to-white/5 transition-all duration-500"></div>

                    <CardHeader className="pb-3 pt-5 px-5 relative z-10">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <CardTitle className="text-base font-bold text-foreground group-hover:text-primary transition-all duration-300 flex-1 line-clamp-2">
                          {test.name}
                        </CardTitle>
                        {isDisabled && (
                          <Badge variant="secondary" className="text-[10px] flex-shrink-0 animate-pulse">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={sc.variant} className={`text-xs px-2 py-1 gap-1.5 ${sc.color} group-hover:shadow-md transition-all duration-300`}>
                          <StatusIcon className="h-3 w-3 group-hover:scale-125 transition-transform duration-300" />
                          {sc.label}
                        </Badge>
                        <span className={`text-xs font-medium ${sc.color} group-hover:scale-110 transition-transform origin-left duration-300`}>
                          {test.dataPoints} pts
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 relative z-10">
                      {test.keyResults.length > 0 ? (
                        <div className="space-y-2 mb-4">
                          {test.keyResults.slice(0, 2).map((r, i) => (
                            <div key={i} className="flex justify-between items-center group/result hover:bg-white/5 px-2 py-1 rounded transition-colors duration-200">
                              <span className="text-xs text-muted-foreground truncate">{r.label}</span>
                              <span className="font-mono text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-300 ml-2 flex-shrink-0">
                                {r.value}
                              </span>
                            </div>
                          ))}
                          {test.keyResults.length > 2 && (
                            <div className="text-xs text-muted-foreground italic pt-1 px-2">
                              +{test.keyResults.length - 2} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mb-4 italic px-2">No data yet</p>
                      )}
                      <Separator className="my-3" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">
                          {test.status === "completed" && <span className="text-green-600">Complete</span>}
                          {test.status === "in-progress" && <span className="text-blue-600 flex items-center gap-1"><span className="h-2 w-2 bg-blue-600 rounded-full animate-pulse"></span>Active</span>}
                          {test.status === "not-started" && <span className="text-slate-600">Pending</span>}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-primary group-hover:text-white group-hover:bg-primary/80 transition-all duration-300 transform group-hover:scale-110"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/tests#${test.id}`);
                          }}
                        >
                          Edit <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform duration-300" />
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

      {/* Test Details Sheet */}
      <Sheet open={!!selectedTest} onOpenChange={(open) => !open && setSelectedTest(null)}>
        <SheetContent className="sm:max-w-lg">
          {selectedTest && (
            <>
              <SheetHeader>
                <SheetTitle className="text-2xl">{selectedTest.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Status Section */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-foreground">Test Status</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 rounded-lg ${statusConfig[selectedTest.status].bgColor}`}>
                      <p className="text-xs text-muted-foreground mb-1">Current Status</p>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const sc = statusConfig[selectedTest.status];
                          const StatusIcon = sc.icon;
                          return (
                            <>
                              <StatusIcon className={`h-5 w-5 ${sc.color}`} />
                              <p className="font-semibold text-foreground">{sc.label}</p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                      <p className="text-xs text-muted-foreground mb-1">Data Points</p>
                      <p className="text-2xl font-bold text-blue-600">{selectedTest.dataPoints}</p>
                    </div>
                  </div>
                </div>

                {/* Enabled Status */}
                {selectedTest.enabled === false && (
                  <div className="p-4 rounded-lg border-2 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <EyeOff className="h-4 w-4 text-yellow-600" />
                      This test is disabled
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Disabled tests are not included in overall progress calculations
                    </p>
                  </div>
                )}

                {/* Key Results */}
                {selectedTest.keyResults.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-foreground">Key Results</h3>
                    <div className="space-y-2">
                      {selectedTest.keyResults.map((result, i) => (
                        <div key={i} className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
                          <p className="text-xs text-muted-foreground mb-1">{result.label}</p>
                          <p className="text-lg font-bold text-foreground font-mono">{result.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category Info */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-foreground">Test Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted">
                      <p className="text-xs text-muted-foreground mb-1">Category</p>
                      <p className="font-semibold text-foreground capitalize">{selectedTest.category}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted">
                      <p className="text-xs text-muted-foreground mb-1">Test ID</p>
                      <p className="font-mono text-sm text-foreground">{selectedTest.id}</p>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  className="w-full"
                  onClick={() => {
                    navigate(`/tests#${selectedTest.id}`);
                    setSelectedTest(null);
                  }}
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Open Test Details
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Dashboard;
