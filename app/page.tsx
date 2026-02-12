export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 px-6 relative overflow-hidden">
      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.015]" 
           style={{ 
             backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(0 0 0) 1px, transparent 0)',
             backgroundSize: '40px 40px'
           }} 
      />
      
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        {/* Main heading - LARGER elegant serif */}
        <h1 className="text-[8rem] md:text-[10rem] mb-8 text-neutral-900 leading-[0.85] font-serif">
          Paths
        </h1>
        
        {/* Subtle divider */}
        <div className="w-12 h-px bg-neutral-300 mx-auto mb-10" />
        
        {/* Main description - evocative and emotional */}
        <p className="text-3xl md:text-4xl text-neutral-800 mb-8 leading-[1.4] max-w-xl mx-auto font-serif font-light">
          Some journeys deserve more than a forgotten photo roll
        </p>
        
        <p className="text-[15px] text-neutral-600 mb-4 leading-[1.8] max-w-lg mx-auto font-light">
          Trace where you've been. Not to track distance or pace, but to hold onto something that matters.
        </p>
        
        <p className="text-[15px] text-neutral-600 mb-14 leading-[1.8] max-w-lg mx-auto font-light">
          A walk through grief. The last year with your old dog. A wolf's migration mapped for awareness. A route to recovery. The first trip as a family. Movement that changed you, rendered visible.
        </p>
        
        {/* CTA Button */}
        <a 
          href="/create"
          className="inline-block px-10 py-4 bg-neutral-900 text-neutral-50 text-[11px] tracking-[0.15em] uppercase hover:bg-neutral-800 transition-all duration-300 hover:shadow-lg font-medium"
        >
          Begin
        </a>
        
        {/* Bottom text */}
        <p className="text-[10px] text-neutral-400 mt-20 tracking-[0.2em] uppercase font-light">
          Manual · Quiet · Yours
        </p>
      </div>
      
      {/* Footer */}
      <div className="absolute bottom-8 text-center w-full">
        <p className="text-[10px] text-neutral-400 tracking-[0.15em] uppercase font-light">
          Phase 1
        </p>
      </div>
    </main>
  );
}