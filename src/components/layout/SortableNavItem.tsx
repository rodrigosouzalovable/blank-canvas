import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableNavItemProps {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
  statusBadge?: string;
}

export function SortableNavItem({ id, href, label, icon: Icon, isActive, onClick, badge, statusBadge }: SortableNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div className="flex items-center">
        <button
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 z-10"
          tabIndex={-1}
        >
          <GripVertical className="h-3.5 w-3.5 text-sidebar-foreground" />
        </button>
        <Link
          to={href}
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors w-full pl-7",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/50"
          )}
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
          {badge != null && badge > 0 && (
            <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {badge}
            </span>
          )}
          {statusBadge && (
            <span className="ml-auto bg-green-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5 animate-pulse">
              {statusBadge}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
