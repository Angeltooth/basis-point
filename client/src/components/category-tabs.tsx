import { CATEGORIES, type Category } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUES: Array<Category | "All"> = ["All", ...CATEGORIES];

interface CategoryTabsProps {
  value: Category | "All";
  onChange: (value: Category | "All") => void;
  counts: Record<string, number>;
}

export function CategoryTabs({ value, onChange, counts }: CategoryTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Category | "All")}>
      <TabsList className="flex flex-wrap h-auto w-fit gap-1 bg-transparent p-0">
        {TAB_VALUES.map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full border border-border px-3.5"
            data-testid={`tab-category-${tab.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          >
            {tab}
            <span className="ml-1.5 font-mono text-xs opacity-70">{counts[tab] ?? 0}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
