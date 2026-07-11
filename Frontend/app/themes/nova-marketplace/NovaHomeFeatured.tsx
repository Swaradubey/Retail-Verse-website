import { Link } from 'react-router';

const FEATURED_CATEGORIES = [
  { title: 'Electronics', image: 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?q=80&w=400&auto=format&fit=crop', tag: 'Up to 40% off', color: 'bg-blue-500' },
  { title: 'Fashion', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=400&auto=format&fit=crop', tag: 'New arrivals', color: 'bg-pink-500' },
  { title: 'Home & Kitchen', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?q=80&w=400&auto=format&fit=crop', tag: 'Up to 55% off', color: 'bg-emerald-500' },
  { title: 'Beauty', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=400&auto=format&fit=crop', tag: 'Buy 2 Get 1', color: 'bg-purple-500' },
];

export function NovaHomeFeatured() {
  return (
    <section className="py-10 bg-white">
      <div className="max-w-[88rem] mx-auto px-4">
        <h2 className="text-xl font-bold text-[#0f172a] mb-6">Shop by Category</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FEATURED_CATEGORIES.map((cat) => (
            <Link key={cat.title} to="/shop" className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-[4/3]">
              <img src={cat.image} alt={cat.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <span className={`inline-block text-[10px] font-bold text-white ${cat.color} px-2 py-0.5 rounded mb-1`}>{cat.tag}</span>
                <h3 className="text-white font-bold text-sm">{cat.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
