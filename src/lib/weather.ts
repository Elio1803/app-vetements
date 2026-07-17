import type { WeatherCondition, WeatherContext } from '../types'

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    precipitation?: number
    weather_code?: number
    wind_speed_10m?: number
  }
}

export function weatherConditionFromCode(code: number): WeatherCondition {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2 || code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

export function weatherConditionLabel(condition: WeatherCondition): string {
  const labels: Record<WeatherCondition, string> = {
    clear: 'ciel dégagé',
    cloudy: 'ciel nuageux',
    fog: 'brouillard',
    rain: 'pluie',
    snow: 'neige',
    storm: 'orage',
  }
  return labels[condition]
}

export function isWetWeather(weather: WeatherContext): boolean {
  return weather.precipitationMm > 0 || ['rain', 'snow', 'storm'].includes(weather.condition)
}

export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  fetcher: typeof fetch = fetch,
): Promise<WeatherContext> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', latitude.toFixed(5))
  url.searchParams.set('longitude', longitude.toFixed(5))
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
  )
  url.searchParams.set('timezone', 'auto')

  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`)
  const data = await response.json() as OpenMeteoResponse
  const current = data.current
  if (
    !current ||
    typeof current.temperature_2m !== 'number' ||
    typeof current.apparent_temperature !== 'number' ||
    typeof current.precipitation !== 'number' ||
    typeof current.weather_code !== 'number' ||
    typeof current.wind_speed_10m !== 'number'
  ) {
    throw new Error('Réponse météo incomplète.')
  }

  return {
    temperatureC: current.temperature_2m,
    apparentTemperatureC: current.apparent_temperature,
    precipitationMm: current.precipitation,
    weatherCode: current.weather_code,
    windSpeedKmh: current.wind_speed_10m,
    condition: weatherConditionFromCode(current.weather_code),
    observedAt: new Date().toISOString(),
    source: 'open-meteo',
  }
}
