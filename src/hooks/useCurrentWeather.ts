import { useCallback, useEffect, useState } from 'react'
import type { WeatherContext } from '../types'
import { fetchCurrentWeather } from '../lib/weather'

const WEATHER_CACHE_KEY = 'le-dressing:current-weather'
const WEATHER_CACHE_DURATION = 30 * 60 * 1000

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error'

function readCachedWeather(): WeatherContext | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? 'null') as WeatherContext | null
    if (!parsed || Date.now() - Date.parse(parsed.observedAt) > WEATHER_CACHE_DURATION) return null
    return parsed
  } catch {
    return null
  }
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('La localisation n’est pas disponible sur cet appareil.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: WEATHER_CACHE_DURATION,
      timeout: 12_000,
    })
  })
}

function locationErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 1
  ) {
    return 'Autorisez la localisation pour adapter les tenues à votre météo.'
  }
  return 'La météo locale est momentanément indisponible.'
}

export function useCurrentWeather() {
  const initialWeather = readCachedWeather()
  const [weather, setWeather] = useState<WeatherContext | null>(initialWeather)
  const [status, setStatus] = useState<WeatherStatus>(initialWeather ? 'ready' : 'idle')
  const [error, setError] = useState('')

  const requestWeather = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const position = await currentPosition()
      const nextWeather = await fetchCurrentWeather(
        position.coords.latitude,
        position.coords.longitude,
      )
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(nextWeather))
      setWeather(nextWeather)
      setStatus('ready')
    } catch (requestError) {
      setStatus(weather ? 'ready' : 'error')
      setError(locationErrorMessage(requestError))
    }
  }, [weather])

  useEffect(() => {
    if (weather || !navigator.permissions?.query) return
    void navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (permission.state === 'granted') void requestWeather()
    }).catch(() => undefined)
  }, [requestWeather, weather])

  return { weather, status, error, requestWeather }
}
