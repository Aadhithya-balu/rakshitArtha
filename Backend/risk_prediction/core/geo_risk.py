import math
import logging

logger = logging.getLogger(__name__)

class GeoRiskAnalyzer:
    """Geographic risk analysis for parametric insurance"""
    
    # Risk zones mapping (latitude/longitude boundaries)
    HIGH_RISK_ZONES = [
        {
            'name': 'Flood Prone - Mumbai',
            'lat_range': (19.0, 19.3),
            'lon_range': (72.7, 73.0),
            'risk_score': 45
        },
        {
            'name': 'High Pollution - Delhi',
            'lat_range': (28.4, 28.8),
            'lon_range': (77.0, 77.5),
            'risk_score': 50
        },
        {
            'name': 'Coastal Disaster Risk - Chennai',
            'lat_range': (12.8, 13.2),
            'lon_range': (80.2, 80.4),
            'risk_score': 55
        }
    ]
    
    MEDIUM_RISK_ZONES = [
        {
            'name': 'High Traffic - Bangalore',
            'lat_range': (12.8, 13.1),
            'lon_range': (77.5, 77.8),
            'risk_score': 30
        }
    ]
    
    def calculate_zone_risk(self, latitude: float, longitude: float):
        """Calculate risk based on geographic zone"""
        
        # Check high-risk zones
        for zone in self.HIGH_RISK_ZONES:
            if self._is_in_zone(latitude, longitude, zone):
                logger.info(f"Location in high-risk zone: {zone['name']}")
                return zone['risk_score']
        
        # Check medium-risk zones
        for zone in self.MEDIUM_RISK_ZONES:
            if self._is_in_zone(latitude, longitude, zone):
                logger.info(f"Location in medium-risk zone: {zone['name']}")
                return zone['risk_score']
        
        # Default low-risk
        return 15
    
    def _is_in_zone(self, lat: float, lon: float, zone: dict):
        """Check if location is within zone boundary"""
        lat_range = zone['lat_range']
        lon_range = zone['lon_range']
        
        return (lat_range[0] <= lat <= lat_range[1] and 
                lon_range[0] <= lon <= lon_range[1])
    
    def haversine(self, lat1: float, lon1: float, lat2: float, lon2: float):
        """Calculate distance between two lat/lon coordinates in km"""
        R = 6371  # Earth radius in km
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = math.sin(delta_lat / 2) ** 2 + \
            math.cos(lat1_rad) * math.cos(lat2_rad) * \
            math.sin(delta_lon / 2) ** 2
        
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance = R * c
        
        return distance
    
    def check_location_mismatch(self, registered_lat: float, registered_lon: float,
                               claim_lat: float, claim_lon: float, threshold_km: float = 5):
        """Check if claim location is suspicious"""
        distance = self.haversine(registered_lat, registered_lon,
                                 claim_lat, claim_lon)
        
        is_suspicious = distance > threshold_km
        
        return {
            'distance_km': round(distance, 2),
            'is_suspicious': is_suspicious,
            'threshold_km': threshold_km
        }
    
    def get_weather_risk_for_zone(self, latitude: float, longitude: float):
        """Get typical weather risk for zone (mock data)"""
        
        zone_risk = self.calculate_zone_risk(latitude, longitude)
        
        # Return weather-specific risk adjustments
        if zone_risk > 40:  # High risk zone
            return {
                'rainfall_sensitivity': 1.5,
                'aqi_sensitivity': 1.5,
                'temperature_sensitivity': 1.2
            }
        elif zone_risk > 25:  # Medium risk zone
            return {
                'rainfall_sensitivity': 1.2,
                'aqi_sensitivity': 1.2,
                'temperature_sensitivity': 1.0
            }
        else:  # Low risk zone
            return {
                'rainfall_sensitivity': 1.0,
                'aqi_sensitivity': 1.0,
                'temperature_sensitivity': 1.0
            }
    
    def identify_disaster_hotspots(self):
        """Return list of disaster-prone areas"""
        all_zones = self.HIGH_RISK_ZONES + self.MEDIUM_RISK_ZONES
        return sorted(all_zones, key=lambda x: x['risk_score'], reverse=True)


# Legacy function support
def haversine(lat1, lon1, lat2, lon2):
    """Legacy support for existing code"""
    analyzer = GeoRiskAnalyzer()
    return analyzer.haversine(lat1, lon1, lat2, lon2)
