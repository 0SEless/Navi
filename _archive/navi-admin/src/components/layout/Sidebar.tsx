import { NavLink } from 'react-router-dom';
import { Building2, Compass, Globe2, Image, LayoutDashboard, Map, QrCode } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campuses', icon: Globe2, label: 'Campuses' },
  { to: '/buildings', icon: Building2, label: 'Buildings' },
  { to: '/routes', icon: Map, label: 'Route Graph' },
  { to: '/panoramas', icon: Image, label: 'Panoramas' },
  { to: '/qrcodes', icon: QrCode, label: 'QR Codes' },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
        <Compass className="h-6 w-6 text-blue-600" />
        <span className="text-lg font-bold">NAVI Admin</span>
      </div>
      <nav className="space-y-1 p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
