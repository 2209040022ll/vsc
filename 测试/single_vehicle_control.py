"""
HUTB 基础单车辆控制模板
用于快速验证单车速度、转向和制动控制。
"""

import hutb


def main():
    sim = hutb.init_simulator(host="localhost", port=8000)
    scene = hutb.load_scene("/scenes/urban_road.scene")
    car = hutb.create_vehicle("sedan", (0, 0, 0), color="blue")

    hutb.start_simulation(realtime=True)
    hutb.set_vehicle_speed(car, speed=50)

    try:
        for _ in range(500):
            state = hutb.get_vehicle_state(car)
            hutb.set_vehicle_control(car, throttle=0.45, brake=0.0, steer=0.0)
            hutb.step(delta_time=0.02)
            print("speed=", state.speed, "position=", state.position)
    finally:
        hutb.stop_simulation()
        hutb.destroy(sim)


if __name__ == "__main__":
    main()
