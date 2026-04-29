import { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  DollarSign,
  LogOut,
  Menu,
  X,
  Users,
  UserCog,
  User,
  UsersRound,
  RotateCcw,
  FileSpreadsheet,
  Wallet,
  MessageSquare,
  Target,
  Bot,
  Volume2,
  Flame,
  Activity,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PaymentReminders } from '@/components/PaymentReminders';
import { RetornoAlertChecker } from '@/components/RetornoAlertChecker';
import { ScrollArea } from '@/components/ui/scroll-area';
import acordosIcon from '@/assets/acordos-icon.png';
import { supabase } from '@/integrations/supabase/client';
import { useVoiceCampaignSending } from '@/contexts/VoiceCampaignSendingContext';
import { useAutoSend } from '@/hooks/useAutoSend';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableNavItem } from './SortableNavItem';

interface AppLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  gestorOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/conta', label: 'Minha Conta', icon: User },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/acordos', label: 'Meus Acordos', icon: FileText },
  { href: '/acordos/novo', label: 'Novo Acordo', icon: PlusCircle },
  { href: '/retornos', label: 'Retornos', icon: RotateCcw },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/meta', label: 'Meta', icon: Target },
  { href: '/comissoes', label: 'Minhas Comissões', icon: DollarSign },
  { href: '/equipe/acordos', label: 'Acordos da Equipe', icon: Users, gestorOnly: true },
  { href: '/admin/usuarios', label: 'Usuários', icon: UserCog, adminOnly: true },
  { href: '/admin/equipes', label: 'Equipes', icon: UsersRound, adminOnly: true },
  { href: '/admin/auditoria', label: 'Auditoria', icon: FileSpreadsheet, adminOnly: true },
  { href: '/admin/financeiro', label: 'Financeiro', icon: Wallet, adminOnly: true },
  { href: '/admin/importar-devedores', label: 'Importar Devedores', icon: FileSpreadsheet, adminOnly: true },
  { href: '/admin/acionamento', label: 'Acionamento', icon: MessageSquare, adminOnly: true },
  { href: '/admin/automacao-cobmais', label: 'Robô CobMais', icon: Bot, adminOnly: true },
  { href: '/campanhas-voz', label: 'Campanhas de Voz', icon: Volume2 },
  { href: '/inbox', label: 'WhatsApp Inbox', icon: MessageSquare, adminOnly: true },
  { href: '/aquecimento', label: 'Aquecimento', icon: Flame },
  { href: '/monitor-envios', label: 'Monitor Envios', icon: Activity, adminOnly: true },
  { href: '/admin/exportar-dados', label: 'Exportar Dados', icon: Download, adminOnly: true },
];

function applyCustomOrder(items: NavItem[], savedOrder: string[] | null): NavItem[] {
  if (!savedOrder || savedOrder.length === 0) return items;
  
  const itemMap = new Map(items.map(item => [item.href, item]));
  const ordered: NavItem[] = [];
  
  for (const href of savedOrder) {
    const item = itemMap.get(href);
    if (item) {
      ordered.push(item);
      itemMap.delete(href);
    }
  }
  
  // Append any items not in savedOrder at the end
  for (const item of itemMap.values()) {
    ordered.push(item);
  }
  
  return ordered;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const { isAdmin, isGestor } = useUserRole();
  const { abasPermitidas } = useUserPermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOrder, setSidebarOrder] = useState<string[] | null>(null);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sendingCampaignId, sendingProgress } = useVoiceCampaignSending();
  const { autoSending, autoProgress } = useAutoSend();

  // Load sidebar order from profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('sidebar_order')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data && (data as any).sidebar_order) {
          setSidebarOrder((data as any).sidebar_order as string[]);
        }
      });
  }, [user]);

  // Fetch inbox unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    if (isAdmin || abasPermitidas?.includes('/inbox')) {
      // Check if user has shared inbox access
      const { data: perms } = await supabase
        .from('user_permissions')
        .select('inbox_compartilhado, acordos_compartilhados, concedido_por')
        .eq('user_id', user.id)
        .maybeSingle();

      const shared = (perms as any)?.inbox_compartilhado || (perms as any)?.acordos_compartilhados;
      const concedidoPor = (perms as any)?.concedido_por as string | null;

      if (isAdmin) {
        // Admin sees all their own instances unread count
        const { data: adminInstances } = await supabase
          .from('user_whatsapp_instances')
          .select('id')
          .eq('user_id', user.id)
          .eq('ativo', true);
        if (adminInstances && adminInstances.length > 0) {
          const ids = adminInstances.map(i => i.id);
          const { count } = await supabase
            .from('whatsapp_contatos')
            .select('id', { count: 'exact', head: true })
            .in('instancia_id', ids)
            .gt('nao_lido', 0).eq('arquivado', false);
          setInboxUnreadCount(count ?? 0);
          return;
        }
      } else if (shared && concedidoPor) {
        // Shared inbox: show unread from admin who granted access
        const { data: sharedInstances } = await supabase
          .from('user_whatsapp_instances')
          .select('id')
          .eq('user_id', concedidoPor)
          .eq('ativo', true);
        if (sharedInstances && sharedInstances.length > 0) {
          const ids = sharedInstances.map(i => i.id);
          const { count } = await supabase
            .from('whatsapp_contatos')
            .select('id', { count: 'exact', head: true })
            .in('instancia_id', ids)
            .gt('nao_lido', 0).eq('arquivado', false);
          setInboxUnreadCount(count ?? 0);
          return;
        }
      }
    }

    // Default: only own instances
    const { data: instances } = await supabase
      .from('user_whatsapp_instances')
      .select('id')
      .eq('user_id', user.id)
      .eq('ativo', true);
    
    if (!instances || instances.length === 0) {
      setInboxUnreadCount(0);
      return;
    }

    const instanceIds = instances.map(i => i.id);
    const { count } = await supabase
      .from('whatsapp_contatos')
      .select('id', { count: 'exact', head: true })
      .in('instancia_id', instanceIds)
      .gt('nao_lido', 0).eq('arquivado', false);
    
    setInboxUnreadCount(count ?? 0);
  }, [user, isAdmin, abasPermitidas]);

  useEffect(() => {
    fetchUnreadCount();

    const channel = supabase
      .channel('inbox-unread-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_contatos' }, () => {
        fetchUnreadCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUnreadCount]);

  // Save sidebar order with debounce
  const saveSidebarOrder = useCallback((newOrder: string[]) => {
    if (!user) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      supabase
        .from('profiles')
        .update({ sidebar_order: newOrder } as any)
        .eq('id', user.id)
        .then(() => {});
    }, 500);
  }, [user]);

  // Filter nav items based on role
  const filteredNavItems = navItems.filter((item) => {
    if (isAdmin) return true;
    if (abasPermitidas) {
      return abasPermitidas.includes(item.href);
    }
    if (item.adminOnly) return false;
    if (item.gestorOnly && !isGestor) return false;
    return true;
  });

  // Apply custom order after filtering
  const orderedNavItems = applyCustomOrder(filteredNavItems, sidebarOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedNavItems.findIndex(item => item.href === active.id);
    const newIndex = orderedNavItems.findIndex(item => item.href === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedNavItems, oldIndex, newIndex);
    const newOrderHrefs = reordered.map(item => item.href);
    setSidebarOrder(newOrderHrefs);
    saveSidebarOrder(newOrderHrefs);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={acordosIcon} alt="Meus Acordos" className="h-6 w-6" />
          <h1 className="text-lg font-bold">MEUS ACORDOS</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-primary-foreground">
            <PaymentReminders />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-primary-foreground hover:bg-primary/80"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-sidebar text-sidebar-foreground transform transition-transform duration-200 ease-in-out",
        "lg:translate-x-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="shrink-0 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={acordosIcon} alt="Meus Acordos" className="h-8 w-8" />
                <h1 className="text-xl font-bold">MEUS ACORDOS</h1>
              </div>
              <PaymentReminders />
            </div>
            <p className="text-sm opacity-80 mt-2 ml-10">{user?.email}</p>
          </div>

          <ScrollArea className="flex-1">
            <nav className="px-4">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={orderedNavItems.map(item => item.href)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedNavItems.map((item) => (
                    <SortableNavItem
                      key={item.href}
                      id={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={location.pathname === item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      badge={item.href === '/inbox' ? inboxUnreadCount : undefined}
                      statusBadge={
                        item.href === '/campanhas-voz' && sendingCampaignId && sendingProgress
                          ? `${sendingProgress.sent + sendingProgress.errors}/${sendingProgress.total}`
                          : item.href === '/admin/acionamento' && autoSending && autoProgress
                            ? `${autoProgress.current}/${autoProgress.total}`
                            : undefined
                      }
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </nav>
          </ScrollArea>

          <div className="shrink-0 p-4 border-t border-sidebar-border">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5" />
              <span>Sair</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>

      {/* Global Retorno Alert Checker */}
      <RetornoAlertChecker />
    </div>
  );
}
