export default function BakeryHome() {
  return (
    <main className="bakery-page mx-auto">
      <header className="bakery-header flex items-center justify-between">
        <span>Juniper Lane</span>
        <span>Neighborhood bakery</span>
      </header>
      <section className="bakery-intro">
        <h1 data-oid="bakery-title">Juniper Lane Bakery</h1>
        <p data-oid="bakery-intro">Sourdough, pastries, and something warm for the walk home.</p>
      </section>
      <section className="bakery-hours grid gap-5" aria-label="Hours and pickup">
        <div>
          <h2 data-oid="counter-title">At the counter</h2>
          <p data-oid="opening-time">Store opens: 8 AM</p>
        </div>
        <div>
          <h2 data-oid="pickup-title">Weekend orders</h2>
          <p data-oid="pickup-time">Saturday pickup: 8 AM</p>
        </div>
      </section>
    </main>
  );
}
