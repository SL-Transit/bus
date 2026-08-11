"use strict";

const SERVICE_TIME = /^(?:[0-3]?\d|4[0-7]):[0-5]\d:[0-5]\d$/;

function codedError(code, details) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function seconds(value) {
  if (!SERVICE_TIME.test(value || "")) throw codedError("journey_service_time_invalid", value);
  const parts = value.split(":").map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function serviceTime(value) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return [hours, minutes, secs].map(function (part) { return String(part).padStart(2, "0"); }).join(":");
}

function values(object) {
  return object && typeof object === "object" ? Object.values(object) : [];
}

function routeOperator(model, routeId) {
  const route = model.routesById && model.routesById[routeId];
  return route ? route.operatorId : null;
}

function transferMatches(rule, state, targetRoute, model) {
  const targetOperator = routeOperator(model, targetRoute.routeId);
  if (rule.fromOperatorId && rule.fromOperatorId !== state.lastOperatorId) return false;
  if (rule.toOperatorId && rule.toOperatorId !== targetOperator) return false;
  if (rule.fromServiceMode && rule.fromServiceMode !== state.lastMode) return false;
  if (rule.toServiceMode && rule.toServiceMode !== targetRoute.serviceMode) return false;
  return true;
}

function sameLocationTransfer(model, state, targetRoute) {
  const rules = values(model.transfersByLocationId && model.transfersByLocationId[state.locationId]);
  return rules.filter(function (rule) {
    return rule.toLocationId === state.locationId && transferMatches(rule, state, targetRoute, model);
  }).sort(function (a, b) {
    return a.minimumTransferSeconds - b.minimumTransferSeconds;
  })[0] || null;
}

function fareFor(model, routeId, originLocationId, destinationLocationId) {
  const rules = values(model.fareRulesByRouteId && model.fareRulesByRouteId[routeId]);
  const candidates = rules.filter(function (rule) {
    const originMatches = !rule.originLocationId || rule.originLocationId === originLocationId;
    const destinationMatches = !rule.destinationLocationId || rule.destinationLocationId === destinationLocationId;
    return originMatches && destinationMatches;
  });
  if (!candidates.length) return null;
  candidates.sort(function (a, b) {
    const aSpecific = Number(Boolean(a.originLocationId)) + Number(Boolean(a.destinationLocationId));
    const bSpecific = Number(Boolean(b.originLocationId)) + Number(Boolean(b.destinationLocationId));
    return bSpecific - aSpecific || a.amountMinor - b.amountMinor;
  });
  return candidates[0];
}

function createJourneyEngine(readModel) {
  const model = readModel || {};
  if (!model.routesById || !model.patternStopsByPatternId) throw codedError("journey_read_model_invalid");
  const edgesByDate = new Map();

  function buildEdges(serviceDate) {
    if (edgesByDate.has(serviceDate)) return edgesByDate.get(serviceDate);
    const rideByOrigin = {};

    function addRide(edge) {
      rideByOrigin[edge.fromLocationId] = rideByOrigin[edge.fromLocationId] || [];
      rideByOrigin[edge.fromLocationId].push(edge);
    }

    Object.keys(model.fixedTripsByRouteDate || {}).forEach(function (routeId) {
      const trips = values(model.fixedTripsByRouteDate[routeId] && model.fixedTripsByRouteDate[routeId][serviceDate]);
      trips.forEach(function (trip) {
        const stopTimes = values(model.stopTimesByTripId && model.stopTimesByTripId[trip.fixedTripId]).sort(function (a, b) {
          return a.stopSequence - b.stopSequence;
        });
        for (let from = 0; from < stopTimes.length - 1; from += 1) {
          for (let to = from + 1; to < stopTimes.length; to += 1) {
            addRide({
              kind: "fixed",
              serviceId: trip.fixedTripId,
              routeId,
              operatorId: routeOperator(model, routeId),
              serviceMode: "fixed",
              fromLocationId: stopTimes[from].locationId,
              toLocationId: stopTimes[to].locationId,
              departureSeconds: seconds(stopTimes[from].departureTime),
              arrivalSeconds: seconds(stopTimes[to].arrivalTime)
            });
          }
        }
      });
    });

    Object.keys(model.frequenciesByRouteDate || {}).forEach(function (routeId) {
      const services = values(model.frequenciesByRouteDate[routeId] && model.frequenciesByRouteDate[routeId][serviceDate]);
      services.forEach(function (frequency) {
        const stops = values(model.patternStopsByPatternId[frequency.journeyPatternId]).sort(function (a, b) {
          return a.stopSequence - b.stopSequence;
        });
        const durations = model.networkIndexes &&
          model.networkIndexes.segmentTravelSecondsByPatternId &&
          model.networkIndexes.segmentTravelSecondsByPatternId[frequency.journeyPatternId] || {};
        const prefix = [0];
        for (let index = 1; index < stops.length; index += 1) {
          const duration = durations[String(index)];
          if (!Number.isInteger(duration) || duration <= 0) {
            throw codedError("journey_frequency_runtime_missing", {
              journeyPatternId: frequency.journeyPatternId,
              fromStopSequence: index
            });
          }
          prefix[index] = prefix[index - 1] + duration;
        }
        for (let from = 0; from < stops.length - 1; from += 1) {
          for (let to = from + 1; to < stops.length; to += 1) {
            addRide({
              kind: "frequency",
              serviceId: frequency.frequencyServiceId,
              routeId,
              operatorId: routeOperator(model, routeId),
              serviceMode: "frequency",
              fromLocationId: stops[from].locationId,
              toLocationId: stops[to].locationId,
              windowStartSeconds: seconds(frequency.startTime) + prefix[from],
              windowEndSeconds: seconds(frequency.endTime) + prefix[from],
              headwaySeconds: frequency.headwaySeconds,
              travelSeconds: prefix[to] - prefix[from],
              expectedWaitRule: "half_headway"
            });
          }
        }
      });
    });

    Object.values(rideByOrigin).forEach(function (edges) {
      edges.sort(function (a, b) {
        const aTime = a.kind === "fixed" ? a.departureSeconds : a.windowStartSeconds;
        const bTime = b.kind === "fixed" ? b.departureSeconds : b.windowStartSeconds;
        return aTime - bTime;
      });
    });
    const built = { rideByOrigin };
    edgesByDate.set(serviceDate, built);
    return built;
  }

  function departureFor(edge, earliestSeconds) {
    if (edge.kind === "fixed") {
      return edge.departureSeconds >= earliestSeconds ? {
        departureSeconds: edge.departureSeconds,
        arrivalSeconds: edge.arrivalSeconds,
        expectedWaitSeconds: edge.departureSeconds - earliestSeconds
      } : null;
    }
    const ready = Math.max(earliestSeconds, edge.windowStartSeconds);
    const expectedWait = edge.headwaySeconds / 2;
    const departure = ready + expectedWait;
    if (departure > edge.windowEndSeconds) return null;
    return {
      departureSeconds: departure,
      arrivalSeconds: departure + edge.travelSeconds,
      expectedWaitSeconds: expectedWait
    };
  }

  function findJourney(query) {
    const request = query || {};
    if (!request.originLocationId || !request.destinationLocationId || !request.serviceDate) {
      throw codedError("journey_query_required");
    }
    const departureSeconds = seconds(request.departureTime);
    const maxTransfers = Number.isInteger(request.maxTransfers) ? request.maxTransfers : 3;
    const maxStates = Number.isInteger(request.maxVisitedStates) ? request.maxVisitedStates : 10000;
    const graph = buildEdges(request.serviceDate);
    const queue = [{
      locationId: request.originLocationId,
      time: departureSeconds,
      ridesTaken: 0,
      lastRouteId: null,
      lastOperatorId: null,
      lastMode: null,
      lastAlightTime: null,
      pendingTransferRule: null,
      legs: [],
      fareMinor: 0,
      fareComplete: true
    }];
    const best = new Map();
    let visited = 0;

    while (queue.length) {
      queue.sort(function (a, b) { return a.time - b.time; });
      const state = queue.shift();
      const key = [
        state.locationId,
        state.ridesTaken,
        state.lastRouteId || "-",
        state.pendingTransferRule && state.pendingTransferRule.transferRuleId || "-"
      ].join("|");
      if (best.has(key) && best.get(key) <= state.time) continue;
      best.set(key, state.time);
      visited += 1;
      if (visited > maxStates) throw codedError("journey_state_limit_exceeded");
      if (state.locationId === request.destinationLocationId && state.ridesTaken > 0) {
        return {
          found: true,
          serviceDate: request.serviceDate,
          originLocationId: request.originLocationId,
          destinationLocationId: request.destinationLocationId,
          departureTime: request.departureTime,
          arrivalTime: serviceTime(state.time),
          durationSeconds: state.time - departureSeconds,
          transfers: Math.max(0, state.ridesTaken - 1),
          fareMinor: state.fareComplete ? state.fareMinor : null,
          fareStatus: state.fareComplete ? "complete" : "incomplete",
          legs: state.legs,
          visitedStates: visited
        };
      }

      const rides = graph.rideByOrigin[state.locationId] || [];
      rides.forEach(function (edge) {
        if (state.ridesTaken >= maxTransfers + 1) return;
        const targetRoute = model.routesById[edge.routeId];
        let readyTime = state.time;
        let transferLeg = null;
        if (state.ridesTaken > 0) {
          let rule = state.pendingTransferRule;
          if (rule) {
            if (!transferMatches(rule, state, targetRoute, model)) return;
            if (state.lastAlightTime + rule.maximumTransferSeconds < state.time) return;
          } else {
            rule = sameLocationTransfer(model, state, targetRoute);
            if (!rule) return;
            readyTime += rule.minimumTransferSeconds;
            if (readyTime > state.lastAlightTime + rule.maximumTransferSeconds) return;
            transferLeg = {
              kind: "transfer",
              transferRuleId: rule.transferRuleId,
              fromLocationId: state.locationId,
              toLocationId: state.locationId,
              durationSeconds: rule.minimumTransferSeconds
            };
          }
        }
        const timing = departureFor(edge, readyTime);
        if (!timing) return;
        const fareRule = fareFor(model, edge.routeId, edge.fromLocationId, edge.toLocationId);
        const rideLeg = {
          kind: "ride",
          serviceMode: edge.serviceMode,
          serviceId: edge.serviceId,
          routeId: edge.routeId,
          operatorId: edge.operatorId,
          fromLocationId: edge.fromLocationId,
          toLocationId: edge.toLocationId,
          departureTime: serviceTime(timing.departureSeconds),
          arrivalTime: serviceTime(timing.arrivalSeconds),
          expectedWaitSeconds: timing.expectedWaitSeconds,
          fareRuleId: fareRule && fareRule.fareRuleId || null,
          fareMinor: fareRule && fareRule.amountMinor || null
        };
        queue.push({
          locationId: edge.toLocationId,
          time: timing.arrivalSeconds,
          ridesTaken: state.ridesTaken + 1,
          lastRouteId: edge.routeId,
          lastOperatorId: edge.operatorId,
          lastMode: edge.serviceMode,
          lastAlightTime: timing.arrivalSeconds,
          pendingTransferRule: null,
          legs: state.legs.concat(transferLeg ? [transferLeg, rideLeg] : [rideLeg]),
          fareMinor: state.fareMinor + (fareRule ? fareRule.amountMinor : 0),
          fareComplete: state.fareComplete && Boolean(fareRule)
        });
      });

      if (state.ridesTaken > 0 && !state.pendingTransferRule) {
        values(model.transfersByLocationId && model.transfersByLocationId[state.locationId]).forEach(function (rule) {
          if (rule.toLocationId === state.locationId) return;
          if (rule.fromOperatorId && rule.fromOperatorId !== state.lastOperatorId) return;
          if (rule.fromServiceMode && rule.fromServiceMode !== state.lastMode) return;
          queue.push({
            ...state,
            locationId: rule.toLocationId,
            time: state.time + rule.minimumTransferSeconds,
            pendingTransferRule: rule,
            legs: state.legs.concat([{
              kind: "transfer",
              transferRuleId: rule.transferRuleId,
              fromLocationId: rule.fromLocationId,
              toLocationId: rule.toLocationId,
              durationSeconds: rule.minimumTransferSeconds
            }])
          });
        });
      }
    }

    return {
      found: false,
      serviceDate: request.serviceDate,
      originLocationId: request.originLocationId,
      destinationLocationId: request.destinationLocationId,
      reason: "no_journey",
      visitedStates: visited
    };
  }

  return Object.freeze({ findJourney, clearDateCache: function () { edgesByDate.clear(); } });
}

module.exports = { createJourneyEngine, seconds, serviceTime };