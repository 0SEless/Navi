import { expect, it } from 'vitest'
import { distanceMeters } from '@navi/core'
import { buildDoorGeoJSON } from '../DoorLayer'
it.each([0,90,35])('keeps a fallback door opening in meter units at angle %s',angle=>{
 const line=buildDoorGeoJSON([{id:'d',roomId:'r',buildingId:'b',floor:0,position:{lng:122.17,lat:11.82},width:1.2,angle,isExterior:false}]).features[0].geometry.coordinates
 expect(distanceMeters({lng:line[0][0],lat:line[0][1]},{lng:line[1][0],lat:line[1][1]})).toBeCloseTo(1.2,2)
})
