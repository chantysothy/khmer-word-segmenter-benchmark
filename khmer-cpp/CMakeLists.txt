cmake_minimum_required(VERSION 3.10)
project(khmer_segmenter_cpp)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find OpenMP
find_package(OpenMP)
if(OpenMP_CXX_FOUND)
    message(STATUS "OpenMP found, enabling multi-threading support")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${OpenMP_C_FLAGS}")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${OpenMP_CXX_FLAGS}")
else()
    message(WARNING "OpenMP not found, multi-threading disabled")
endif()

# Compiler optimization flags
if(MSVC)
    add_compile_options(/O2 /arch:AVX2)
else()
    add_compile_options(-O3 -march=native -Wall -Wextra)
endif()

# Include directories
include_directories(src)

# Source files
file(GLOB SOURCES "src/*.cpp")

# Executable
add_executable(khmer_segmenter_cpp ${SOURCES})

if(OpenMP_CXX_FOUND)
    target_link_libraries(khmer_segmenter_cpp OpenMP::OpenMP_CXX)
endif()
