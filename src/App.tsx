/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  LogOut, 
  Plus, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Truck, 
  XCircle,
  Menu,
  X,
  Store,
  ArrowRight,
  TrendingUp,
  Box,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
type UserRole = 'dealer' | 'reseller';

interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  name: string;
  companyName: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  dealerId: string;
  category: string;
  imageUrl?: string;
}

interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  resellerId: string;
  dealerId: string;
  items: OrderItem[];
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  createdAt: any;
}

// Components
const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger', size?: 'default' | 'sm' | 'lg' }>(
  ({ className, variant = 'primary', size = 'default', ...props }, ref) => {
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
      secondary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
      outline: 'border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-700',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-600',
      danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
    };
    const sizes = {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-12 px-8 text-base',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className, key }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div key={key} className={cn('bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' | 'info' }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider', variants[variant])}>
      {children}
    </span>
  );
};

// Firestore Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Main App
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'orders' | 'catalog'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleCompleteProfile = async (role: UserRole, companyName: string) => {
    if (!user) return;
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      role,
      name: user.displayName || 'User',
      companyName,
    };
    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={handleLogin} />;
  }

  if (!profile) {
    return <Onboarding onComplete={handleCompleteProfile} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center gap-3 border-b border-slate-100">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <Store size={24} />
            </div>
            <span className="font-bold text-xl text-slate-900">B2B Connect</span>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <SidebarItem 
              icon={<LayoutDashboard size={20} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} 
            />
            {profile.role === 'dealer' ? (
              <SidebarItem 
                icon={<Package size={20} />} 
                label="Inventory" 
                active={activeTab === 'inventory'} 
                onClick={() => { setActiveTab('inventory'); setIsSidebarOpen(false); }} 
              />
            ) : (
              <SidebarItem 
                icon={<Search size={20} />} 
                label="Catalog" 
                active={activeTab === 'catalog'} 
                onClick={() => { setActiveTab('catalog'); setIsSidebarOpen(false); }} 
              />
            )}
            <SidebarItem 
              icon={<ClipboardList size={20} />} 
              label="Orders" 
              active={activeTab === 'orders'} 
              onClick={() => { setActiveTab('orders'); setIsSidebarOpen(false); }} 
            />
          </nav>

          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 mb-4">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                {profile.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{profile.name}</p>
                <p className="text-xs text-slate-500 truncate">{profile.role}</p>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => signOut(auth)}>
              <LogOut size={18} />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40">
          <button className="lg:hidden p-2 -ml-2 text-slate-600" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold text-slate-900 capitalize">{activeTab}</h1>
          <div className="flex items-center gap-4">
            <Badge variant="info">{profile.companyName}</Badge>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <Dashboard profile={profile} />}
              {activeTab === 'inventory' && profile.role === 'dealer' && <Inventory dealerId={profile.uid} />}
              {activeTab === 'catalog' && profile.role === 'reseller' && <Catalog resellerId={profile.uid} />}
              {activeTab === 'orders' && <Orders profile={profile} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}

// Sub-components
function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active 
          ? "bg-indigo-50 text-indigo-700" 
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <Store size={20} />
          </div>
          <span className="font-bold text-xl">B2B Connect</span>
        </div>
        <Button onClick={onLogin}>Sign In</Button>
      </nav>
      
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Badge variant="info">The Future of B2B Commerce</Badge>
          <h1 className="mt-6 text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
            Connect Dealers & Resellers <span className="text-indigo-600">Seamlessly.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 leading-relaxed">
            Automate your ordering process, manage inventory in real-time, and grow your business with our specialized B2B platform.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={onLogin}>
              Get Started Now <ArrowRight className="ml-2" size={20} />
            </Button>
            <Button variant="outline" size="lg">
              View Demo
            </Button>
          </div>
        </motion.div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
          <FeatureCard 
            icon={<TrendingUp className="text-indigo-600" />} 
            title="Automated Orders" 
            description="Reduce manual errors with our smart ordering system that syncs instantly."
          />
          <FeatureCard 
            icon={<Box className="text-emerald-600" />} 
            title="Inventory Sync" 
            description="Dealers and resellers stay in sync with real-time stock level updates."
          />
          <FeatureCard 
            icon={<Users className="text-blue-600" />} 
            title="B2B Networking" 
            description="Build strong relationships with verified business partners in your industry."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="p-6 text-left hover:border-indigo-200 transition-colors">
      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
    </Card>
  );
}

function Onboarding({ onComplete }: { onComplete: (role: UserRole, company: string) => void }) {
  const [role, setRole] = useState<UserRole>('reseller');
  const [company, setCompany] = useState('');

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Complete Your Profile</h2>
        <p className="text-slate-500 mb-8">Tell us a bit more about your business to get started.</p>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">I am a...</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setRole('dealer')}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  role === 'dealer' ? "border-indigo-600 bg-indigo-50" : "border-slate-100 hover:border-slate-200"
                )}
              >
                <Store className={cn("mb-2", role === 'dealer' ? "text-indigo-600" : "text-slate-400")} />
                <p className="font-bold text-slate-900">Dealer</p>
                <p className="text-xs text-slate-500">I supply products</p>
              </button>
              <button
                onClick={() => setRole('reseller')}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  role === 'reseller' ? "border-indigo-600 bg-indigo-50" : "border-slate-100 hover:border-slate-200"
                )}
              >
                <ShoppingCart className={cn("mb-2", role === 'reseller' ? "text-indigo-600" : "text-slate-400")} />
                <p className="font-bold text-slate-900">Reseller</p>
                <p className="text-xs text-slate-500">I buy products</p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Enter your business name"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <Button 
            className="w-full h-11" 
            disabled={!company} 
            onClick={() => onComplete(role, company)}
          >
            Finish Setup
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Dashboard({ profile }: { profile: UserProfile }) {
  const [stats, setStats] = useState({ orders: 0, revenue: 0, products: 0 });

  useEffect(() => {
    const ordersQuery = query(
      collection(db, 'orders'),
      where(profile.role === 'dealer' ? 'dealerId' : 'resellerId', '==', profile.uid)
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const orders = snapshot.docs.map(doc => doc.data() as Order);
      const totalRevenue = orders.reduce((acc, curr) => acc + curr.total, 0);
      setStats(prev => ({ ...prev, orders: orders.length, revenue: totalRevenue }));
    });

    if (profile.role === 'dealer') {
      const productsQuery = query(collection(db, 'products'), where('dealerId', '==', profile.uid));
      onSnapshot(productsQuery, (snapshot) => {
        setStats(prev => ({ ...prev, products: snapshot.size }));
      });
    }

    return unsubscribe;
  }, [profile]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          icon={<ClipboardList className="text-indigo-600" />} 
          label="Total Orders" 
          value={stats.orders} 
          trend="+12%" 
        />
        <StatCard 
          icon={<TrendingUp className="text-emerald-600" />} 
          label="Total Revenue" 
          value={`$${stats.revenue.toLocaleString()}`} 
          trend="+8%" 
        />
        <StatCard 
          icon={<Package className="text-blue-600" />} 
          label={profile.role === 'dealer' ? "Products" : "Suppliers"} 
          value={stats.products || 1} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Clock size={20} className="text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">New order received #ORD-00{i}</p>
                  <p className="text-xs text-slate-500">2 hours ago</p>
                </div>
                <Badge variant="info">Pending</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" className="h-24 flex-col gap-2">
              <Plus size={24} />
              <span>{profile.role === 'dealer' ? 'Add Product' : 'New Order'}</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col gap-2">
              <Users size={24} />
              <span>View Partners</span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend }: { icon: React.ReactNode; label: string; value: string | number; trend?: string }) {
  return (
    <Card className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
        {trend && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">{trend}</span>}
      </div>
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </Card>
  );
}

function Inventory({ dealerId }: { dealerId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'products'), where('dealerId', '==', dealerId));
    return onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });
  }, [dealerId]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const productData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price: Number(formData.get('price')),
      stock: Number(formData.get('stock')),
      category: formData.get('category') as string,
      dealerId,
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), productData);
      }
    } catch (error) {
      handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search inventory..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2" size={18} /> Add Product
        </Button>
      </div>

      <Card>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Product</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Price</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Stock</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Box size={20} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{product.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Badge>{product.category}</Badge>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">${product.price}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      product.stock > 10 ? "bg-emerald-500" : product.stock > 0 ? "bg-amber-500" : "bg-red-500"
                    )} />
                    <span className="text-sm text-slate-700">{product.stock} units</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/50">
          <Card className="w-full max-w-lg p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => { setIsModalOpen(false); setEditingProduct(null); }}>
                <X size={24} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                <input name="name" defaultValue={editingProduct?.name} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea name="description" defaultValue={editingProduct?.description} className="w-full px-4 py-2 rounded-lg border border-slate-200" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price ($)</label>
                  <input name="price" type="number" step="0.01" defaultValue={editingProduct?.price} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
                  <input name="stock" type="number" defaultValue={editingProduct?.stock} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input name="category" defaultValue={editingProduct?.category} required className="w-full px-4 py-2 rounded-lg border border-slate-200" />
              </div>
              <div className="pt-4 flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setIsModalOpen(false); setEditingProduct(null); }}>Cancel</Button>
                <Button type="submit" className="flex-1">Save Product</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

function Catalog({ resellerId }: { resellerId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });
  }, []);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1, price: product.price }];
    });
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    
    // Group by dealer
    const dealerIds = Array.from(new Set(cart.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      return p?.dealerId;
    })));

    for (const dealerId of dealerIds) {
      if (!dealerId) continue;
      const dealerItems = cart.filter(item => {
        const p = products.find(prod => prod.id === item.productId);
        return p?.dealerId === dealerId;
      });

      const total = dealerItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);

      try {
        await addDoc(collection(db, 'orders'), {
          resellerId,
          dealerId,
          items: dealerItems,
          status: 'pending',
          total,
          createdAt: Timestamp.now(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'orders');
      }
    }

    setCart([]);
    setIsCartOpen(false);
    alert('Orders placed successfully!');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Button variant="outline" className="relative" onClick={() => setIsCartOpen(true)}>
          <ShoppingCart className="mr-2" size={18} /> Cart
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {cart.reduce((acc, curr) => acc + curr.quantity, 0)}
            </span>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {products.map((product) => (
          <Card key={product.id} className="flex flex-col">
            <div className="aspect-square bg-slate-100 flex items-center justify-center">
              <Box size={48} className="text-slate-300" />
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-slate-900">{product.name}</h3>
                <Badge variant="success">${product.price}</Badge>
              </div>
              <p className="text-sm text-slate-500 mb-4 line-clamp-2">{product.description}</p>
              <div className="mt-auto pt-4 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{product.stock} in stock</span>
                <Button size="sm" onClick={() => addToCart(product)} disabled={product.stock === 0}>
                  Add to Cart
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            className="w-full max-w-md bg-white h-full shadow-xl flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">Your Cart</h2>
              <button onClick={() => setIsCartOpen(false)}><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-20">
                  <ShoppingCart size={48} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-slate-500">Your cart is empty</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.productId} className="flex items-center gap-4 p-3 rounded-lg border border-slate-100">
                    <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center">
                      <Box size={20} className="text-slate-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">${item.price} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-600"
                        onClick={() => setCart(prev => prev.map(i => i.productId === item.productId ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0))}
                      >-</button>
                      <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                      <button 
                        className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-600"
                        onClick={() => setCart(prev => prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i))}
                      >+</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-6 border-t border-slate-100 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Total</span>
                <span className="text-2xl font-bold text-slate-900">
                  ${cart.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0).toLocaleString()}
                </span>
              </div>
              <Button className="w-full h-12" disabled={cart.length === 0} onClick={handlePlaceOrder}>
                Checkout
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function Orders({ profile }: { profile: UserProfile }) {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where(profile.role === 'dealer' ? 'dealerId' : 'resellerId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    });
  }, [profile]);

  const updateStatus = async (orderId: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {orders.map((order) => (
          <Card key={order.id} className="p-6">
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-bold text-slate-900">Order #{order.id.slice(-6).toUpperCase()}</h3>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-xs text-slate-500">
                  Placed on {order.createdAt?.toDate ? format(order.createdAt.toDate(), 'MMM dd, yyyy HH:mm') : 'Recently'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 mb-1">Total Amount</p>
                <p className="text-xl font-bold text-slate-900">${order.total.toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">{item.name} <span className="text-slate-400">x{item.quantity}</span></span>
                  <span className="font-medium text-slate-900">${(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <Users size={16} className="text-slate-400" />
                </div>
                <span className="text-xs font-medium text-slate-600">
                  {profile.role === 'dealer' ? 'Reseller ID: ' : 'Dealer ID: '} {profile.role === 'dealer' ? order.resellerId.slice(0, 8) : order.dealerId.slice(0, 8)}...
                </span>
              </div>
              
              {profile.role === 'dealer' && order.status === 'pending' && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => updateStatus(order.id, 'cancelled')}>Cancel</Button>
                  <Button size="sm" onClick={() => updateStatus(order.id, 'confirmed')}>Confirm Order</Button>
                </div>
              )}
              {profile.role === 'dealer' && order.status === 'confirmed' && (
                <Button size="sm" onClick={() => updateStatus(order.id, 'shipped')}>Mark as Shipped</Button>
              )}
              {profile.role === 'dealer' && order.status === 'shipped' && (
                <Button size="sm" onClick={() => updateStatus(order.id, 'delivered')}>Mark as Delivered</Button>
              )}
            </div>
          </Card>
        ))}

        {orders.length === 0 && (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-200">
            <ClipboardList size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-500 font-medium">No orders found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const configs = {
    pending: { variant: 'warning' as const, icon: <Clock size={12} /> },
    confirmed: { variant: 'info' as const, icon: <CheckCircle2 size={12} /> },
    shipped: { variant: 'info' as const, icon: <Truck size={12} /> },
    delivered: { variant: 'success' as const, icon: <CheckCircle2 size={12} /> },
    cancelled: { variant: 'error' as const, icon: <XCircle size={12} /> },
  };
  const config = configs[status];
  return (
    <Badge variant={config.variant}>
      <span className="flex items-center gap-1">
        {config.icon}
        {status}
      </span>
    </Badge>
  );
}
