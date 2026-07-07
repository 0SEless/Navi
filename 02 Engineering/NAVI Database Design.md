# NAVI Database Design

Source: `C:\Users\Administrator\Downloads\NAVI_Project_Docs\DATABASE_DESIGN.md`

## Database Direction

NAVI will use self-managed PostgreSQL + PostGIS as the main backend database. SQLite is only for mobile/offline cache.

## Platform Schema Direction

The database must support multiple campuses. Major records should include `campus_id` so each campus can manage its own map, buildings, directory, routes, QR codes, panoramas, and analytics.

## Core Platform Tables

### Campuses

- id
- name
- slug
- description
- address
- boundary_polygon
- status

### Campus Map Settings

- id
- campus_id
- provider
- default_latitude
- default_longitude
- default_zoom
- map_style_url
- boundary_polygon

### Campus Admins

- id
- campus_id
- user_id
- role

## Existing Tables To Upgrade

### Users

- id
- name
- email
- password_hash
- role

### Buildings

- id
- campus_id
- name
- description
- latitude
- longitude
- image

### Floors

- id
- campus_id
- building_id
- name
- level_number
- floor_plan_image

### Rooms

- id
- campus_id
- building_id
- floor_id
- name
- room_type
- route_node_id

### Departments

- id
- campus_id
- building_id
- name
- description

### Faculty

- id
- campus_id
- department_id
- room_id
- name
- position
- office

### Panoramas

- id
- campus_id
- building_id
- floor_id
- route_node_id
- image_url

### Hotspots

- id
- campus_id
- panorama_id
- target_panorama_id
- x_coordinate
- y_coordinate

### Route Nodes

- id
- campus_id
- building_id
- floor_id
- latitude
- longitude
- x_coordinate
- y_coordinate
- node_type

### Route Edges

- id
- campus_id
- from_node_id
- to_node_id
- distance
- travel_type
- is_bidirectional

### QR Codes

- id
- campus_id
- building_id
- floor_id
- route_node_id
- qr_value

## Storage Rule

Store image and panorama files in object storage. PostgreSQL should store metadata and URLs only.

## Links

- [[NAVI Project Requirements]]
- [[NAVI System Architecture]]
- [[NAVI Roadmap]]
- [[NAVI Platform Upgrade Plan]]
- [[ADR 002 - PostgreSQL PostGIS Database]]
