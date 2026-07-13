package com.sanamchai.drivergps;

import java.util.HashSet;
import java.util.Set;

final class DriverIdentityCenter {
    static final String PROFILE_ROOT = "data/driverIdentityCenter/accounts";
    static final String ACCOUNT_ACTIVE = "active";
    static final String SESSION_ACTIVE = "active";

    private DriverIdentityCenter() {}

    static boolean isAuthorizedProfile(String authUid,
                                       String profileUid,
                                       String erpVehicleId,
                                       String runtimeVehicleId,
                                       String accountStatus,
                                       String sessionStatus) {
        return notBlank(authUid)
                && authUid.equals(profileUid)
                && notBlank(erpVehicleId)
                && notBlank(runtimeVehicleId)
                && ACCOUNT_ACTIVE.equals(accountStatus)
                && SESSION_ACTIVE.equals(sessionStatus);
    }

    static boolean isValidVehicleBinding(String erpVehicleId, String runtimeVehicleId) {
        return notBlank(erpVehicleId)
                && notBlank(runtimeVehicleId)
                && !erpVehicleId.equals(runtimeVehicleId);
    }

    static boolean isSelfOnlyWorkPath(String serviceDate, String runtimeVehicleId, String requestedRuntimeVehicleId) {
        return notBlank(serviceDate)
                && notBlank(runtimeVehicleId)
                && runtimeVehicleId.equals(requestedRuntimeVehicleId);
    }

    static Set<String> requiredFields() {
        Set<String> fields = new HashSet<>();
        fields.add("uid");
        fields.add("driverId");
        fields.add("erpVehicleId");
        fields.add("runtimeVehicleId");
        fields.add("accountStatus");
        fields.add("sessionStatus");
        return fields;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
