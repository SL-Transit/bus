# Greenfield Data Contract

เอกสารนี้เป็น logical contract สำหรับระบบใหม่ ไม่ได้หมายความว่าข้อมูลใน Excel กรอกครบแล้ว

## กติกากลาง

- ID เป็น string แบบ immutable และไม่เปลี่ยนตามชื่อ
- ห้ามใช้ชื่อป้าย ทะเบียนรถ อีเมล หรือเบอร์โทรเป็น primary ID
- วันที่ใช้ YYYY-MM-DD; system timestamp ใช้ UTC ISO-8601
- เวลาให้บริการใช้ HH:mm:ss ตาม timezone ของ service calendar
- เงินเก็บเป็น integer หน่วยย่อย; ระยะเวลาใช้ seconds; ระยะทางใช้ meters
- Entity ที่เผยแพร่ต้องมี recordStatus, effectiveFrom และ effectiveTo
- System actor/timestamp สร้างโดย backend ห้ามเชื่อค่าจาก Excel/browser

## Import Package Metadata

    packageId
    schemaVersion
    templateVersion
    sourceFileName
    sourceChecksumSha256
    createdAt
    createdByUid
    operatorScope
    mode = validate_only
    idempotencyKey

ไฟล์จริงเก็บใน Storage quarantine ส่วน RTDB เก็บ metadata, checksum และผลตรวจ

## Entity Groups

### Identity and Access

- operators
- accounts
- accountAccess

Custom Claims เก็บเพียง coarse role เช่น platformAdmin, operatorUser, operations หรือ viewer ส่วน operator/location/route scope และสิทธิ์ละเอียดอยู่ใน accountAccess

### Shared Network

- locations: station, stop, hub, depot, queuePoint
- platforms
- locationAccess
- serviceGroups

locationId เป็นตัวเชื่อมข้ามบริษัท ห้ามสร้างสถานที่ซ้ำเพียงเพราะคนละ operator

### Routes

- routes
- journeyPatterns
- journeyPatternStops
- serviceCalendars
- calendarExceptions

Route คือบริการเชิงพาณิชย์ ส่วน Journey Pattern คือลำดับจุดจริง

### Fixed Schedule

- fixedTrips
- stopTimes

ใช้เมื่อมีเวลาเที่ยวและเวลารายป้ายแน่นอน

### Frequency/Queue

ต้องเพิ่ม frequencyServices แยกจาก fixed trip โดยมีอย่างน้อย:

    frequencyServiceId
    routeId
    journeyPatternId
    serviceCalendarId
    startTime
    endTime
    headwaySeconds
    boardingModel = queue
    expectedWaitRule = half_headway
    exactTimes = false
    capacityPolicyId

serviceMode ต้องเป็น fixed, frequency หรือ hybrid และมาจากข้อมูล ไม่ผูกกับเลข Group

### Fare

- fareProducts
- fareRules
- transferFareRules

fareProductId ต้องมี master entity ห้ามเป็น foreign key ลอย

### Transfer

ใช้ transferRule ที่ location/hub เป็นหลัก:

    transferRuleId
    fromLocationId
    toLocationId
    fromOperatorId optional
    toOperatorId optional
    fromServiceMode
    toServiceMode
    minimumTransferSeconds
    maximumTransferSeconds
    throughBooking
    baggageTransfer
    accessibilitySeconds optional

Trip-specific constraint เป็น optional override เพื่อรองรับการต่อรถคิว

### Operations

- queues
- vehicles
- drivers
- vehicleBlocks
- driverDuties
- assignments
- platformAssignments
- incidents

GPS/live state แยกจาก Published Schedule และมี retention policy ของตนเอง

### Booking and Payment

เป็น transaction domain แยก ไม่สร้างจาก Excel และไม่อยู่ใน Master Data Publication การจองต้องบันทึก publishedVersionId และ snapshot เงื่อนไขสำคัญเพื่อ audit

## Published Read Model

หนึ่ง version มีอย่างน้อย:

    manifest
    operatorsById
    locationsById
    platformsByLocationId
    routesById
    patternsByRouteId
    patternStopsByPatternId
    calendarsById
    fixedTripsByRouteDate
    stopTimesByTripId
    frequenciesByRouteDate
    fareProductsById
    fareRulesByRouteId
    transfersByLocationId
    networkIndexes

Consumer ต้องประกาศ node ที่อ่าน ห้ามอ่าน version root

## สิ่งที่ Excel ต้องเติมก่อนนำเข้า

- Frequency fields
- Fare product master
- Publication metadata
- Import checksum/idempotency
- Transfer policy ที่ไม่บังคับผูก trip
- Backend-generated audit fields

ข้อมูลไม่ครบต้องเป็น validation error ไม่ใช่ค่า default ที่เดาเอง