export function isWithinSelectedLimits({
  gustSpeed,
  maxGust,
  maxSpeed,
  speed,
  userDif,
  userLicense,
  userMaxGust,
  userMaxSpeed,
}) {
  if (
    (userLicense || userMaxSpeed || userMaxGust || userDif) &&
    (speed > 25 || gustSpeed > 25 || maxSpeed > 25 || maxGust > 25)
  ) {
    return false;
  }

  if (
    (userLicense === "A" &&
      speed !== null &&
      (speed > 17 || gustSpeed > 17 || maxSpeed > 17 || maxGust > 17)) ||
    (userLicense === "B" &&
      speed !== null &&
      (speed > 19 || gustSpeed > 19 || maxSpeed > 19 || maxGust > 19)) ||
    (userLicense === "C" &&
      speed !== null &&
      (speed > 21 || gustSpeed > 21 || maxSpeed > 21 || maxGust > 21)) ||
    (userLicense === "D" &&
      speed !== null &&
      (speed > 25 || gustSpeed > 25 || maxSpeed > 25 || maxGust > 25))
  ) {
    return false;
  }

  if (
    (speed !== null && userMaxSpeed !== "" && userMaxSpeed < speed) ||
    (maxSpeed !== null && userMaxSpeed !== "" && userMaxSpeed < maxSpeed)
  ) {
    return false;
  }

  if (
    (gustSpeed !== null && userMaxGust !== "" && userMaxGust < gustSpeed) ||
    (maxGust !== null && userMaxGust !== "" && userMaxGust < maxGust)
  ) {
    return false;
  }

  if (
    speed !== null &&
    userDif !== "" &&
    (userDif < gustSpeed - speed ||
      userDif < maxGust - maxSpeed ||
      userDif < maxGust - speed)
  ) {
    return false;
  }

  return true;
}
