import { lazy, Suspense, useEffect } from "react";
import { Redirect, Route, Switch } from "wouter";
import { ShieldOff } from "lucide-react";
import { useAuth, usePermissions, PERMISSION_LABELS } from "./lib/auth";
import { setDisplayTimezone } from "./lib/format";
import { LoginPage } from "./pages/Login";
import { TermsGate } from "./pages/TermsGate";
import { Shell } from "./components/Shell";
import { Loading } from "./components/kit";
import { Button, Spinner } from "./components/ui";
import { Logo } from "./components/Logo";
import { TodayPage } from "./pages/Today";
import { InspectionsPage } from "./pages/inspections/InspectionsPage";
import { InspectionPage } from "./pages/inspections/InspectionPage";
import { InspectionReport } from "./pages/print/InspectionReport";
import { ViolationNotice } from "./pages/print/ViolationNotice";
import { BusinessesPage } from "./pages/businesses/BusinessesPage";
import { BusinessPage } from "./pages/businesses/BusinessPage";
import { ViolationsPage } from "./pages/violations/ViolationsPage";
import { PermitsPage } from "./pages/permits/PermitsPage";
import { PermitPage } from "./pages/permits/PermitPage";
import { PermitPrint } from "./pages/print/PermitPrint";
import { ComplaintsPage } from "./pages/complaints/ComplaintsPage";
import { ComplaintPage } from "./pages/complaints/ComplaintPage";
import { CaseNoticePrint } from "./pages/print/CaseNoticePrint";
import { EventsPage } from "./pages/events/EventsPage";
import { EventPage } from "./pages/events/EventPage";
import { InvestigationsPage } from "./pages/investigations/InvestigationsPage";
import { InvestigationPage } from "./pages/investigations/InvestigationPage";
import { SettingsPage } from "./pages/settings/SettingsPage";

// The map carries Leaflet; it loads only when someone opens it.
const MapPage = lazy(() => import("./pages/map/MapPage").then(m => ({ default: m.MapPage })));

/*
 * Addresses. The Department Portal's /modules/inspections/* links open these
 * (pages/inspection-portal-redirect.tsx there), so keep the two in step.
 */
export function App() {
  const { session, loading, logout } = useAuth();
  const perms = usePermissions();

  useEffect(() => {
    setDisplayTimezone(session?.timezone, session?.use24HourTime);
  }, [session?.timezone, session?.use24HourTime]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }

  if (!session) return <LoginPage />;

  if (!perms.view) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo />
        <ShieldOff className="mt-6 h-12 w-12 text-ink-3" />
        <div>
          <h1 className="text-[24px] font-medium">No Inspection Portal access</h1>
          <p className="mt-2 max-w-lg text-[17px] leading-7 text-ink-2">
            You're signed in to {session.orgName ?? "your department"} as {session.firstName} {session.lastName}, but your
            role doesn't include <b>{PERMISSION_LABELS.view}</b>, or Inspections isn't switched on for the department.
            An administrator can grant it under Roles in the Department Portal.
          </p>
        </div>
        <Button size="lg" onClick={logout}>Sign out</Button>
      </div>
    );
  }

  return (
    <TermsGate>
      <Shell>
        <Switch>
          <Route path="/"><TodayPage /></Route>

          <Route path="/inspections"><InspectionsPage /></Route>
          <Route path="/inspections/:id/report">{p => <InspectionReport id={Number(p.id)} />}</Route>
          <Route path="/inspections/:id/notice">{p => <ViolationNotice id={Number(p.id)} />}</Route>
          <Route path="/inspections/:id">{p => <InspectionPage id={Number(p.id)} />}</Route>

          <Route path="/businesses"><BusinessesPage /></Route>
          <Route path="/businesses/:id">{p => <BusinessPage id={Number(p.id)} />}</Route>

          <Route path="/violations"><ViolationsPage /></Route>

          <Route path="/permits"><PermitsPage /></Route>
          <Route path="/permits/:id/print">{p => <PermitPrint id={Number(p.id)} />}</Route>
          <Route path="/permits/:id">{p => <PermitPage id={Number(p.id)} />}</Route>

          <Route path="/complaints"><ComplaintsPage /></Route>
          <Route path="/complaints/:id/notice">{p => <CaseNoticePrint id={Number(p.id)} />}</Route>
          <Route path="/complaints/:id">{p => <ComplaintPage id={Number(p.id)} />}</Route>

          <Route path="/events"><EventsPage /></Route>
          <Route path="/events/:id">{p => <EventPage id={Number(p.id)} />}</Route>

          <Route path="/investigations">{perms.investigations ? <InvestigationsPage /> : <Redirect to="/" />}</Route>
          <Route path="/investigations/:id">{p => perms.investigations ? <InvestigationPage id={Number(p.id)} /> : <Redirect to="/" />}</Route>

          <Route path="/map"><Suspense fallback={<Loading />}><MapPage /></Suspense></Route>
          <Route path="/settings/:section?">{p => <SettingsPage section={p.section} />}</Route>

          <Route><Redirect to="/" /></Route>
        </Switch>
      </Shell>
    </TermsGate>
  );
}
