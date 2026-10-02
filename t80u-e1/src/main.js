import './style.css';
import { App } from './core/app.js';

const app = new App(document.getElementById('app'));
app.start();
// 便于在浏览器控制台调试
window.__t80 = app;
