import { describe, expect, it, vi } from 'vitest'
import { fetchCurrentWeather, weatherConditionFromCode } from './weather'

describe('weather', () => {
  it('maps WMO weather codes to useful clothing conditions', () => {
    expect(weatherConditionFromCode(0)).toBe('clear')
    expect(weatherConditionFromCode(63)).toBe('rain')
    expect(weatherConditionFromCode(75)).toBe('snow')
    expect(weatherConditionFromCode(86)).toBe('snow')
    expect(weatherConditionFromCode(95)).toBe('storm')
  })

  it('loads and normalizes current Open-Meteo conditions', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      current: {
        temperature_2m: 11.4,
        apparent_temperature: 8.8,
        precipitation: 0.6,
        weather_code: 61,
        wind_speed_10m: 24,
      },
    }), { status: 200 }))

    const weather = await fetchCurrentWeather(48.8566, 2.3522, fetcher as unknown as typeof fetch)

    expect(weather).toMatchObject({
      temperatureC: 11.4,
      apparentTemperatureC: 8.8,
      precipitationMm: 0.6,
      condition: 'rain',
      source: 'open-meteo',
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('current=temperature_2m')
  })
})
