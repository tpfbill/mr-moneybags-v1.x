document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const currentPage = window.location.pathname.split('/').pop();

    navItems.forEach(item => {
        const page = item.getAttribute('data-page');
        const href = item.getAttribute('onclick')?.split("'")[1];

        // Remove active class from all items
        item.classList.remove('active');

        // Add active class to the current page's nav item
        if (page && `index.html?page=${page}` === currentPage) {
            item.classList.add('active');
        } else if (href === currentPage) {
            item.classList.add('active');
        }

        // Handle clicks on data-page items
        if (page) {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = `index.html?page=${page}`;
            });
        }
    });

    // Special case for dashboard, since it's index.html
    if (currentPage === 'index.html' || currentPage === '') {
        const dashboardItem = document.querySelector('.nav-item[data-page="dashboard"]');
        if (dashboardItem) {
            dashboardItem.classList.add('active');
        }
    }
});