cmake_minimum_required(VERSION 3.20)
project(micmute_helper LANGUAGES CXX)

add_executable(micmute-helper src/main.cpp)
target_compile_features(micmute-helper PRIVATE cxx_std_20)
target_compile_definitions(micmute-helper PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(micmute-helper PRIVATE /W4 /permissive- /EHsc)
target_link_libraries(micmute-helper PRIVATE ole32 uuid)
set_target_properties(micmute-helper PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_SOURCE_DIR}/../com.ulanzi.arkamax404micmute.ulanziPlugin/native"
)
