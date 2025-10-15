document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const currentPage = window.location.pathname.split('/').pop();

    navItems.forEach(item => {
        item.classList.remove('active');

        const page = item.getAttribute('data-page');
        const href = item.getAttribute('onclick')?.split("'")[1];

        if (href && href === currentPage) {
            item.classList.add('active');
        } else if (page && `index.html?page=${page}` === currentPage) {
            item.classList.add('active');
        }

        if (page) {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = `index.html?page=${page}`;
            });
        }
    });

    if (currentPage === 'index.html' || currentPage === '') {
        const dashboardItem = document.querySelector('.nav-item[data-page="dashboard"]');
        if (dashboardItem) {
            dashboardItem.classList.add('active');
        }
    }
});