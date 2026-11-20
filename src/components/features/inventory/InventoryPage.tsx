"use client";
// ============ Inventory: Stock + Movements + Sales tabs. Front-end only — data lives in localStorage (see inventory-store). ============
import { PageHeader } from "@/components/molecules/page-header";
import { TopBarTitle } from "@/components/templates/topbar-slots";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlState } from "@/hooks/use-url-state";
import MovementsTab from "./MovementsTab";
import SalesTab from "./SalesTab";
import StockTab from "./StockTab";

const TABS = ["stock", "movements", "sales"] as const;

export default function InventoryPage() {
  const [tab, setTab] = useUrlState("tab", "stock", TABS);

  return (
    <div className="space-y-1">
      <TopBarTitle><h1 className="truncate text-lg font-semibold text-navy-800">Inventory Management</h1></TopBarTitle>
      <PageHeader
        title="Inventory Management"
        description="Stock, movements and sales"
        icon="Package"
        filters={
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-9">
              <TabsTrigger value="stock" className="text-xs">Stock</TabsTrigger>
              <TabsTrigger value="movements" className="text-xs">Movements</TabsTrigger>
              <TabsTrigger value="sales" className="text-xs">Sales</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="stock" className="mt-2"><StockTab /></TabsContent>
        <TabsContent value="movements" className="mt-2"><MovementsTab /></TabsContent>
        <TabsContent value="sales" className="mt-2"><SalesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
