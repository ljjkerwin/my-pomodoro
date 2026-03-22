document.addEventListener('DOMContentLoaded', () => {
    // Get query parameters to determine styling and text
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode'); // 'work' or 'break'

    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');

    if (mode === 'work') {
        document.body.classList.remove('break-mode');
        titleEl.textContent = 'Work Session Complete!';
        msgEl.textContent = 'Great job! Time to take a break.';
    } else {
        document.body.classList.add('break-mode');
        titleEl.textContent = 'Break is Over!';
        msgEl.textContent = 'Time to get back to work.';
    }

    document.getElementById('close-btn').addEventListener('click', () => {
        window.close();
    });
});