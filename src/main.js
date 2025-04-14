import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './style.css'
import App from './App.vue'
import * as d3 from 'd3';

// Make d3 available globally for our map utilities
window.d3 = d3;

createApp(App).mount('#app')
