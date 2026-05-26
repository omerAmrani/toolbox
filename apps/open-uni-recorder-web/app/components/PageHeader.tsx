import { NavBar } from './NavBar';

export function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <header>
      <NavBar />
      <div className="header-inner">{children}</div>
    </header>
  );
}
