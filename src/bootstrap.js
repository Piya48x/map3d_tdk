window.addEventListener('error', function (event) {
            if (!event.message && !event.filename) return;
            const message = document.getElementById('load-message');
            const spinner = document.querySelector('.spinner');
            if (message && document.getElementById('loading')) {
                message.textContent = 'โหลด Three.js หรือ WebGL ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและใช้เบราว์เซอร์รุ่นใหม่';
                if (spinner) spinner.style.display = 'none';
            }
        });
        window.addEventListener('unhandledrejection', function () {
            const message = document.getElementById('load-message');
            if (message && document.getElementById('loading')) {
                message.textContent = 'โหลดโมดูล 3D ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
            }
        });
