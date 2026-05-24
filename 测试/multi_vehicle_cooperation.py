"""
HUTB 多车协同场景模板
用于快速搭建主车、跟驰车和车队控制验证脚本。
"""

import hutb


def main():
    sim = hutb.init_simulator(host="localhost", port=8000)
    scene = hutb.load_scene("/scenes/highway.scene")

    ego = hutb.create_vehicle("sedan", (0, 0, 0), color="blue")
    follower = hutb.create_vehicle("suv", (-18, 0, 0), color="white")
    observer = hutb.create_vehicle("truck", (-42, 3.5, 0), color="yellow")

    hutb.start_simulation(realtime=True)
    hutb.set_vehicle_speed(ego, speed=60)
    hutb.set_vehicle_speed(follower, speed=55)
    hutb.set_vehicle_speed(observer, speed=48)

    try:
        for _ in range(800):
            ego_state = hutb.get_vehicle_state(ego)
            follower_state = hutb.get_vehicle_state(follower)

            distance = ego_state.position.x - follower_state.position.x
            throttle = 0.55 if distance > 20 else 0.25
            brake = 0.0 if distance > 12 else 0.35
            hutb.set_vehicle_control(follower, throttle=throttle, brake=brake, steer=0.0)
            hutb.step(delta_time=0.02)
    finally:
        hutb.stop_simulation()
        hutb.destroy(sim)


if __name__ == "__main__":
    main()
