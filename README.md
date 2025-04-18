# SolSet Sun Tracker

SolSet is an interactive web application that visualizes the sun's position and trajectory on a map for any location and date/time. Similar to tools like SunCalc.org and SunCalc.net, it provides a user-friendly interface to explore sun data including sunrise/sunset times, sun altitude, azimuth, and shadow projections.

## Features

- **Interactive Map**: Displays sun path and position using Leaflet.js with OpenStreetMap tiles
- **Location Search**: Find any location by address or coordinates
- **Geolocation**: Use your current location with the "Locate Me" button
- **Date Selection**: Slider to choose any day of the year
- **Time Selection**: Slider to choose any time in 15-minute increments
- **Sun Data Display**: View detailed information about sun position, times, and shadow length
- **House Layout Visualization**: Visualize optimal house orientation with shadow projections
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- Vue.js 3.5 (Composition API)
- Vite 6.3 (Build tool)
- Leaflet.js 1.9.4 (Map rendering)
- SunCalc.js 1.9.0 (Sun calculations)
- Bootstrap 5.3.5 (Styling)
- Bootstrap Icons 1.11.3
- D3.js 7.9.0 (SVG manipulation for house layout)
- Axios 1.8.4 (HTTP client)

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/solset.git
   cd solset
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser and visit:
   ```
   http://localhost:5173
   ```

## Building for Production

To build the application for production:

```
npm run build
```

The built files will be in the `dist` directory, ready for deployment.

## Deployment

This application is designed to be deployed as a static site. You can use the included deployment script for easy deployment to either AWS S3 or Alibaba Cloud OSS.

### Deploy to AWS S3

1. Ensure you have the AWS CLI installed and configured with appropriate credentials.

2. Run the deployment script:
   ```
   ./deploy.sh s3 your-bucket-name
   ```

3. Configure your S3 bucket for static website hosting:
   - Enable "Static website hosting" in bucket properties
   - Set "Index document" to `index.html`
   - Set appropriate CORS configuration if needed

### Deploy to Alibaba Cloud OSS

1. Ensure you have the ossutil tool installed and configured.

2. Run the deployment script:
   ```
   ./deploy.sh oss your-bucket-name
   ```

3. Configure your OSS bucket for static website hosting:
   - Enable "Static Pages" in bucket settings
   - Set "Default Homepage" to `index.html`
   - Configure CORS settings if needed

## CORS Configuration

If you're experiencing issues with geocoding or other API calls, you may need to configure CORS for your hosting environment.

### Example CORS Configuration for S3

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

## Acknowledgements

- [SunCalc](https://github.com/mourner/suncalc) for precise sun calculations
- [Leaflet](https://leafletjs.com/) for interactive maps
- [OpenStreetMap](https://www.openstreetmap.org/) for map data and Nominatim API

## License

This project is licensed under the MIT License - see the LICENSE file for details.
