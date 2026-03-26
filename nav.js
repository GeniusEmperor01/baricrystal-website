// Shared navigation for all pages
// Detects current page and marks it active
(function() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const links = [
    { href: 'index.html', label: 'Home' },
    { href: 'about.html', label: 'About' },
    { href: 'jobs.html', label: 'Opportunities' },
    { href: 'process.html', label: 'Process' },
    { href: 'faq.html', label: 'FAQ' },
    { href: 'contact.html', label: 'Contact' },
  ];
  const navHTML = `
  <nav id="main-nav">
    <a href="index.html" class="nav-logo">Bari<span class="nav-logo-alt">crystal</span> <span class="nav-logo-int">INTERNATIONAL</span></a>
    <div class="nav-links" id="nav-links">
      ${links.map(l => `<a href="${l.href}" class="nav-link${page === l.href ? ' active' : ''}">${l.label}</a>`).join('')}
    </div>
    <div class="nav-right">
      <a href="payment.html" class="nav-cta">Apply Now</a>
      <button class="nav-burger" id="nav-burger" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="nav-mobile-menu" id="nav-mobile">
    ${links.map(l => `<a href="${l.href}" class="nav-mobile-link${page === l.href ? ' active' : ''}">${l.label}</a>`).join('')}
    <a href="payment.html" class="nav-mobile-cta">Apply Now</a>
  </div>`;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = navHTML;
  document.body.insertBefore(wrapper.firstElementChild, document.body.firstChild);
  document.body.insertBefore(wrapper.firstElementChild, document.body.children[1]);

  document.getElementById('nav-burger').addEventListener('click', function() {
    const menu = document.getElementById('nav-mobile');
    const open = menu.classList.toggle('open');
    this.classList.toggle('open', open);
  });
})();
